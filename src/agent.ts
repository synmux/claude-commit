/**
 * Thin wrapper around the Claude Agent SDK that turns a single prompt into a
 * single text completion.
 *
 * The Agent SDK spawns a bundled `claude` binary, so authentication follows
 * Claude Code's own resolution order over the environment we hand it. By
 * default the API credential variables (`ANTHROPIC_API_KEY` /
 * `ANTHROPIC_AUTH_TOKEN`) are stripped from that environment, forcing the
 * `claude login` subscription session so the cost is bundled with Claude Code
 * usage; the `allowApiKey` config option passes them through for explicit
 * pay-as-you-go billing. We deliberately disable every tool (`tools: []`) and
 * load no settings (`settingSources: []`) so the run is a clean, isolated,
 * prompt-in/text-out request.
 */
import {
  query,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { ClaudeCommitError } from "./errors";
import type { ModelResult } from "./types";

export interface RunPromptOptions {
  /** Model string (alias like `haiku`, `sonnet[1m]`, or a full model id). */
  model: string;
  /** Full custom system prompt. */
  system: string;
  /** Receives assistant text as it streams in (enables partial messages). */
  onText?: (delta: string) => void;
  /** Abort the in-flight request. */
  abortController?: AbortController;
  /** Receives the underlying CLI's stderr (for `--verbose`). */
  onStderr?: (data: string) => void;
  /**
   * Sampling temperature. Passed to the model via `CLAUDE_CODE_EXTRA_BODY`.
   * Used to add variety when generating several interactive options. Models
   * that don't accept a temperature override will reject the request, so the
   * caller should be prepared to retry without it.
   */
  temperature?: number;
  /**
   * Request a structured JSON response matching this schema. The parsed object
   * is returned on {@link ModelResult.structured}. Models that don't support
   * structured outputs will reject the request, so the caller should be
   * prepared to retry without it.
   */
  outputFormat?: { type: "json_schema"; schema: Record<string, unknown> };
  /**
   * Allow API credentials from the environment to reach the SDK subprocess.
   * Defaults to false: `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` are
   * stripped so the run is billed to the Claude subscription.
   */
  allowApiKey?: boolean;
}

/**
 * Environment variables that carry Claude API credentials. Their presence
 * switches the spawned `claude` binary from subscription auth to
 * pay-as-you-go API billing, so they are stripped from the subprocess
 * environment unless the user opts in via the `allowApiKey` config option.
 */
export const GATED_CREDENTIAL_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
] as const;

/**
 * Names of the gated credential variables present in `env`. An empty string
 * counts as present, since presence alone perturbs credential resolution.
 */
export function presentCredentialVars(
  env: Record<string, string | undefined>,
): string[] {
  return GATED_CREDENTIAL_VARS.filter((name) => env[name] !== undefined);
}

export interface SubprocessEnvOptions {
  /** Environment to derive the subprocess environment from (usually `process.env`). */
  baseEnv: Record<string, string | undefined>;
  /**
   * Pass API credential variables through instead of stripping them.
   * Defaults to false so the gate fails safe when a caller omits it.
   */
  allowApiKey?: boolean;
  /** Sampling temperature to inject via `CLAUDE_CODE_EXTRA_BODY`, preserving any existing extra body. */
  temperature?: number;
}

/**
 * Build the environment for the Claude Agent SDK subprocess, or return
 * `undefined` when the parent environment can be inherited unchanged.
 *
 * Unless `allowApiKey` is set, API credential variables are removed so the
 * spawned `claude` binary always authenticates with the user's subscription
 * session - an exported `ANTHROPIC_API_KEY` must never silently switch
 * billing to pay-as-you-go.
 */
export function buildSubprocessEnv(
  opts: SubprocessEnvOptions,
): Record<string, string | undefined> | undefined {
  const { baseEnv, allowApiKey = false, temperature } = opts;
  const stripped = allowApiKey ? [] : presentCredentialVars(baseEnv);
  if (stripped.length === 0 && temperature == null) return undefined;

  const env = { ...baseEnv };
  for (const name of stripped) delete env[name];

  if (temperature != null) {
    let extra: Record<string, unknown> = {};
    const existing = baseEnv.CLAUDE_CODE_EXTRA_BODY;
    if (existing) {
      try {
        const parsed: unknown = JSON.parse(existing);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          extra = parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore a malformed existing value */
      }
    }
    env.CLAUDE_CODE_EXTRA_BODY = JSON.stringify({ ...extra, temperature });
  }

  return env;
}

/** Map a known SDK assistant error code to a friendlier, actionable message. */
function describeAssistantError(code: string): string {
  switch (code) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return (
        "Authentication failed. Run `claude login` to sign in with your Claude " +
        "subscription, or set ANTHROPIC_API_KEY and enable `allowApiKey` in " +
        "your claude-commit config."
      );
    case "billing_error":
      return "Billing error from the Claude API. Check your plan or API credits.";
    case "rate_limit":
      return "Rate limited by the Claude API. Try again shortly.";
    case "overloaded":
      return "The Claude API is overloaded. Try again shortly.";
    case "model_not_found":
      return "The requested model was not found. Check the configured model name.";
    case "max_output_tokens":
      return "The model hit its output limit before finishing.";
    default:
      return `Model request failed (${code}).`;
  }
}

/**
 * Run a single prompt and return the model's text response.
 *
 * Throws {@link ClaudeCommitError} on any model/authentication/quota failure.
 */
export async function runPrompt(
  prompt: string,
  opts: RunPromptOptions,
): Promise<ModelResult> {
  const subprocessEnv = buildSubprocessEnv({
    baseEnv: process.env,
    allowApiKey: opts.allowApiKey ?? false,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
  });
  const options: Options = {
    model: opts.model,
    systemPrompt: opts.system,
    tools: [], // pure text completion: no Bash/Read/Edit/etc.
    maxTurns: 1,
    settingSources: [], // ignore user/project/local settings, CLAUDE.md, MCP, plugins
    includePartialMessages: Boolean(opts.onText),
    ...(opts.abortController ? { abortController: opts.abortController } : {}),
    ...(opts.onStderr ? { stderr: opts.onStderr } : {}),
    ...(subprocessEnv ? { env: subprocessEnv } : {}),
    ...(opts.outputFormat ? { outputFormat: opts.outputFormat } : {}),
  };

  let resultText: string | null = null;
  let costUsd = 0;
  let model: string | undefined;
  let structured: unknown;
  let assistantError: string | undefined;

  let response;
  try {
    response = query({ prompt, options });
    for await (const message of response as AsyncIterable<SDKMessage>) {
      switch (message.type) {
        case "stream_event": {
          if (opts.onText) {
            const event = message.event as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta"
            ) {
              opts.onText(event.delta.text ?? "");
            }
          }
          break;
        }
        case "assistant": {
          if (message.error) assistantError = message.error;
          break;
        }
        case "result": {
          costUsd = message.total_cost_usd ?? 0;
          // The served model is the (only) key of modelUsage, when present.
          const usedModels = Object.keys(message.modelUsage ?? {});
          if (usedModels.length > 0) model = usedModels[0];
          if (message.subtype === "success") {
            resultText = message.result;
            structured = message.structured_output;
          } else {
            const detail =
              "errors" in message && message.errors.length
                ? message.errors.join("; ")
                : message.subtype;
            throw new ClaudeCommitError(`Model run failed: ${detail}`);
          }
          break;
        }
        default:
          break;
      }
    }
  } catch (err) {
    if (err instanceof ClaudeCommitError) throw err;
    if (opts.abortController?.signal.aborted) {
      throw new ClaudeCommitError("Generation was cancelled.");
    }
    throw new ClaudeCommitError(
      `Failed to call the Claude Agent SDK: ${(err as Error).message}`,
    );
  }

  if (assistantError) {
    throw new ClaudeCommitError(describeAssistantError(assistantError));
  }
  if (resultText === null) {
    throw new ClaudeCommitError("The model returned no result.");
  }

  return {
    text: resultText.trim(),
    costUsd,
    ...(model ? { model } : {}),
    ...(structured !== undefined ? { structured } : {}),
  };
}
