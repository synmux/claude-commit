/**
 * Thin wrapper around the Claude Agent SDK that turns a single prompt into a
 * single text completion.
 *
 * The Agent SDK spawns a bundled `claude` binary and inherits `process.env`, so
 * authentication follows Claude Code's own resolution order: if `ANTHROPIC_API_KEY`
 * is unset, a `claude login` subscription session is used and the cost is bundled
 * with Claude Code usage — which is exactly what we want here. We deliberately
 * disable every tool (`tools: []`) and load no settings (`settingSources: []`) so
 * the run is a clean, isolated, prompt-in/text-out request.
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
}

/** Build the subprocess env that injects a temperature override, preserving any existing extra body. */
function envWithTemperature(
  temperature: number,
): Record<string, string | undefined> {
  let extra: Record<string, unknown> = {};
  const existing = process.env.CLAUDE_CODE_EXTRA_BODY;
  if (existing) {
    try {
      extra = JSON.parse(existing);
    } catch {
      /* ignore a malformed existing value */
    }
  }
  return {
    ...process.env,
    CLAUDE_CODE_EXTRA_BODY: JSON.stringify({ ...extra, temperature }),
  };
}

/** Map a known SDK assistant error code to a friendlier, actionable message. */
function describeAssistantError(code: string): string {
  switch (code) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return (
        "Authentication failed. Run `claude login` to sign in with your Claude " +
        "subscription, or set ANTHROPIC_API_KEY."
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
  const options: Options = {
    model: opts.model,
    systemPrompt: opts.system,
    tools: [], // pure text completion: no Bash/Read/Edit/etc.
    maxTurns: 1,
    settingSources: [], // ignore user/project/local settings, CLAUDE.md, MCP, plugins
    includePartialMessages: Boolean(opts.onText),
    ...(opts.abortController ? { abortController: opts.abortController } : {}),
    ...(opts.onStderr ? { stderr: opts.onStderr } : {}),
    ...(opts.temperature != null
      ? { env: envWithTemperature(opts.temperature) }
      : {}),
  };

  let resultText: string | null = null;
  let costUsd = 0;
  let model: string | undefined;
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

  return { text: resultText.trim(), costUsd, ...(model ? { model } : {}) };
}
