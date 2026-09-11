/**
 * The Ollama backend: one prompt to one local (or self-hosted) model.
 *
 * cco speaks Ollama's **native** `/api/chat`, not either of its compatibility
 * layers. The OpenAI layer has no field for the context length, and cco sizes
 * every diff chunk against a context window, so a dialect that cannot state
 * one is unusable here; the Anthropic layer exists to let Anthropic SDK
 * clients point at Ollama, and cco does not talk raw Anthropic - it talks
 * Agent SDK, which spawns its own binary. The native API gives
 * `options.num_ctx`, structured output via `format`, and the usage counts
 * that make a truncated prompt detectable.
 *
 * There is no SDK dependency: one `fetch` against one endpoint, so nothing
 * here assumes a particular JavaScript runtime.
 *
 * ## Two failure modes worth knowing about
 *
 * **A prompt over the context window is truncated silently.** Ollama drops
 * the oldest content, returns HTTP 200, and flags nothing. A summary written
 * from half a diff is worse than no summary, so every request pins
 * `options.num_ctx` to the same number the chunks were sized against, and
 * the response's `prompt_eval_count` is checked against it afterwards.
 * Where that number comes from is {@link resolveOllamaContext}: a configured
 * token count, or - by default - the window Ollama itself picks for the
 * model on this machine, read back from `/api/ps` after a preload.
 * Reaching the limit means content was dropped, and cco raises an error
 * whose text contains "prompt is too long" - the phrase
 * {@link isPromptTooLongError} matches - so the pipeline's existing
 * halve-and-re-split retry handles it exactly as it handles a Claude
 * overflow. Ollama has no rejection of its own to trigger that path, so this
 * synthesises one.
 *
 * **An error can arrive after HTTP 200.** In a streamed response it is a
 * plain NDJSON line `{"error": "..."}` partway through, long after the
 * status line said everything was fine, so every parsed line is checked for
 * it rather than trusting the status code.
 */
import { ClaudeCommitError } from "./errors";
import {
  DEFAULT_OLLAMA_CONTEXT,
  DEFAULT_OLLAMA_HOST,
  parseModelRef,
} from "./models";
import type { ModelResult, OllamaConfig, RunPromptOptions } from "./types";

/** Ollama settings with every default filled in; the context may still be `"auto"`. */
export interface ResolvedOllama {
  host: string;
  context: number | "auto";
  keepAlive: string | number | null;
}

/** {@link ResolvedOllama} after `"auto"` has been turned into a number. */
export interface OllamaRequestSettings {
  host: string;
  contextTokens: number;
  keepAlive: string | number | null;
}

/**
 * Normalise a base URL: add a scheme to a bare `host:port` and drop any
 * trailing slash. Ollama's own `OLLAMA_HOST` convention allows the bare
 * form, so `127.0.0.1:11434` has to mean what a user expects it to.
 */
export function normaliseOllamaHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (trimmed === "") return DEFAULT_OLLAMA_HOST;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
}

/**
 * The Ollama base URL for this run: the configured `ollama.host`, else
 * `$OLLAMA_HOST`, else {@link DEFAULT_OLLAMA_HOST}.
 */
export function resolveOllamaHost(
  configured?: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const candidate = configured?.trim() || env.OLLAMA_HOST?.trim() || "";
  return normaliseOllamaHost(candidate);
}

/**
 * Fill in defaults for any Ollama setting the config left out. A missing
 * or unusable `context` becomes `"auto"`; turning that into a number is
 * {@link resolveOllamaContext}'s job, because it takes a round trip.
 */
export function resolveOllamaConfig(
  config: Partial<OllamaConfig> | undefined,
  env: Record<string, string | undefined> = process.env,
): ResolvedOllama {
  const context = config?.context;
  return {
    host: resolveOllamaHost(config?.host, env),
    context:
      typeof context === "number" && context > 0
        ? Math.floor(context)
        : DEFAULT_OLLAMA_CONTEXT,
    keepAlive: config?.keepAlive ?? null,
  };
}

/** The one field of a `/api/ps` entry cco reads, plus the names it matches on. */
interface OllamaLoadedModel {
  name?: string;
  model?: string;
  context_length?: number;
}

/**
 * Ask Ollama what context window it would run `model` with on this machine.
 *
 * Two calls. The first is a chat request with no messages, which loads the
 * model (a no-op if it is already resident) *without* a `num_ctx` - so the
 * server applies its own choice, made from available VRAM (4k / 32k / 256k
 * tiers, capped at the model's trained maximum). The second reads that
 * choice back from `/api/ps`, which reports the window each loaded model is
 * actually running with. The load was going to happen on the first real
 * request anyway, so the only added cost is the `ps` round trip.
 *
 * This is deliberately not `/api/show`'s `context_length`, which is the
 * *trained* maximum regardless of hardware - 131072 for a model this
 * machine may only be able to run at 32768. The number the server picked
 * is the one it can actually load.
 */
export async function probeOllamaContext(
  model: string,
  settings: { host: string; keepAlive: string | number | null },
  signal?: AbortSignal,
): Promise<number> {
  const { host, keepAlive } = settings;
  const preload = await ollamaFetch(
    `${host}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [],
        stream: false,
        ...(keepAlive !== null ? { keep_alive: keepAlive } : {}),
      }),
    },
    host,
    signal,
  );
  if (!preload.ok) {
    throw new ClaudeCommitError(
      await describeHttpFailure(preload, host, model),
    );
  }

  const ps = await ollamaFetch(
    `${host}/api/ps`,
    { method: "GET" },
    host,
    signal,
  );
  if (!ps.ok) {
    throw new ClaudeCommitError(await describeHttpFailure(ps, host, model));
  }
  const body = (await ps.json()) as { models?: OllamaLoadedModel[] };
  const loaded = (body.models ?? []).find(
    (entry) => entry.name === model || entry.model === model,
  );
  const contextLength = loaded?.context_length;
  if (typeof contextLength !== "number" || contextLength <= 0) {
    throw new ClaudeCommitError(
      `Ollama loaded "${model}" but did not report its context window in ` +
        `/api/ps, so cco cannot size the diff for it. Set "ollama.context" ` +
        `to a token count to pin one.`,
    );
  }
  return Math.floor(contextLength);
}

/**
 * The context window to use for `model`: the configured number, or the
 * server's own choice when the config says `"auto"` (see
 * {@link probeOllamaContext}). Callers that make several requests to the
 * same model should resolve once and reuse the result.
 */
export async function resolveOllamaContext(
  model: string,
  config: Partial<OllamaConfig> | undefined,
  signal?: AbortSignal,
): Promise<number> {
  const resolved = resolveOllamaConfig(config);
  if (resolved.context !== "auto") return resolved.context;
  const { name } = parseModelRef(model);
  return probeOllamaContext(name, resolved, signal);
}

/** `fetch` with transport failures and cancellation turned into cco errors. */
async function ollamaFetch(
  url: string,
  init: RequestInit,
  host: string,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, ...(signal ? { signal } : {}) });
  } catch (error) {
    if (signal?.aborted) {
      throw new ClaudeCommitError("Generation was cancelled.");
    }
    throw new ClaudeCommitError(describeTransportFailure(error, host));
  }
}

/** The body of a native `/api/chat` request. */
export interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  stream: boolean;
  format?: Record<string, unknown>;
  keep_alive?: string | number;
  options: Record<string, unknown>;
}

/**
 * Build the `/api/chat` body for one prompt.
 *
 * Two things are deliberate. Sampling parameters go inside `options` - at the
 * top level Ollama accepts and silently ignores them, so a misplaced
 * `temperature` would look like a model that refuses to vary. And `think` is
 * never sent at all: models disagree on whether reasoning can be switched
 * off (gpt-oss cannot, and takes only a level; Granite uses its own field
 * entirely), so asking is a needless way to earn a 400. Any `thinking` that
 * comes back is dropped on the floor instead.
 */
export function buildChatRequest(
  prompt: string,
  opts: RunPromptOptions,
  settings: OllamaRequestSettings,
): OllamaChatRequest {
  const { name } = parseModelRef(opts.model);
  const options: Record<string, unknown> = { num_ctx: settings.contextTokens };
  if (opts.temperature != null) options.temperature = opts.temperature;

  return {
    model: name,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: prompt },
    ],
    // Stream only when someone is watching the text arrive. A single JSON
    // body is easier to get right, and is what Ollama's own guidance
    // recommends for structured output.
    stream: Boolean(opts.onText),
    ...(opts.outputFormat ? { format: opts.outputFormat.schema } : {}),
    ...(settings.keepAlive !== null ? { keep_alive: settings.keepAlive } : {}),
    options,
  };
}

/** The fields of a chat response cco actually reads. */
interface OllamaChatChunk {
  model?: string;
  message?: { content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  prompt_eval_cached_count?: number;
  eval_count?: number;
  error?: string;
}

/** Turn a non-2xx response into a message that says what to do about it. */
async function describeHttpFailure(
  response: Response,
  host: string,
  model: string,
): Promise<string> {
  let detail = "";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      detail = String((body as { error: unknown }).error);
    }
  } catch {
    /* a non-JSON error body tells us nothing extra */
  }

  switch (response.status) {
    case 404:
      return (
        `Ollama has no model "${model}" on ${host}. Pull it first with ` +
        `\`ollama pull ${model}\`, or check the exact name with \`ollama list\`.`
      );
    case 400:
      return (
        `Ollama rejected the request for "${model}"${detail ? `: ${detail}` : ""}. ` +
        `Check the model supports plain chat completion (\`ollama show ${model}\`).`
      );
    case 401:
    case 403:
      return `Ollama at ${host} refused the request as unauthorised${detail ? `: ${detail}` : ""}.`;
    case 429:
      return `Ollama at ${host} is rate limiting requests. Try again shortly.`;
    case 500:
      return (
        `Ollama failed to run "${model}"${detail ? `: ${detail}` : ""}. ` +
        `This is often the model runner running out of memory - set ` +
        `"ollama.context" to a smaller number or use a smaller model.`
      );
    case 503:
      return `Ollama at ${host} has a full request queue. Try again shortly.`;
    default:
      return (
        `Ollama at ${host} returned ${response.status} ${response.statusText}` +
        (detail ? `: ${detail}` : "") +
        "."
      );
  }
}

/** Turn a transport-level failure into a message that says what to do about it. */
function describeTransportFailure(error: unknown, host: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /econnrefused|failed to fetch|unable to connect|connection refused/i.test(
      message,
    )
  ) {
    return (
      `Cannot reach the Ollama server at ${host}. Start it with ` +
      `\`ollama serve\`, or set "ollama.host" in your claude-commit config.`
    );
  }
  return `Failed to call Ollama at ${host}: ${message}`;
}

/**
 * Read one NDJSON stream, forwarding text deltas and returning the final
 * chunk. Each line is checked for an `error` key: a mid-stream failure
 * arrives that way, after the 200 has already been sent, so a status check
 * alone would miss it.
 */
async function consumeStream(
  response: Response,
  onText: ((delta: string) => void) | undefined,
): Promise<{ content: string; final: OllamaChatChunk }> {
  const body = response.body;
  if (!body) throw new ClaudeCommitError("Ollama returned an empty response.");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let final: OllamaChatChunk = {};

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    let chunk: OllamaChatChunk;
    try {
      chunk = JSON.parse(trimmed) as OllamaChatChunk;
    } catch {
      throw new ClaudeCommitError(
        `Ollama sent a malformed response line: ${trimmed.slice(0, 200)}`,
      );
    }
    if (chunk.error) throw new ClaudeCommitError(`Ollama: ${chunk.error}`);
    const delta = chunk.message?.content ?? "";
    if (delta !== "") {
      content += delta;
      onText?.(delta);
    }
    if (chunk.done) final = chunk;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      handleLine(line);
    }
  }
  buffer += decoder.decode();
  handleLine(buffer);

  if (!final.done) {
    throw new ClaudeCommitError(
      "Ollama's response ended before the model finished.",
    );
  }
  return { content, final };
}

/**
 * Tokens the server reported for the prompt. `prompt_eval_cached_count` is
 * documented as its own counter without saying whether cached tokens are
 * also inside `prompt_eval_count`, so take the larger: under either reading
 * that is the prompt's real size, and neither double-counts.
 */
function promptTokensOf(final: OllamaChatChunk): number {
  return Math.max(
    final.prompt_eval_count ?? 0,
    final.prompt_eval_cached_count ?? 0,
  );
}

/**
 * Run a single prompt against an Ollama model and return its response.
 *
 * Throws {@link ClaudeCommitError} on any transport, model or truncation
 * failure. `costUsd` is always zero: local inference is not billed, so a
 * mixed-provider run's reported cost is exactly its Claude half.
 */
export async function runOllamaPrompt(
  prompt: string,
  opts: RunPromptOptions,
): Promise<ModelResult> {
  const { name } = parseModelRef(opts.model);
  const signal = opts.abortController?.signal;
  // A caller that has already resolved `"auto"` (the pipeline does, once
  // per model) passes a number through and pays nothing here; a direct
  // caller with `"auto"` pays the probe on every call.
  const base = resolveOllamaConfig(opts.ollama);
  const resolved: OllamaRequestSettings = {
    host: base.host,
    keepAlive: base.keepAlive,
    contextTokens: await resolveOllamaContext(opts.model, opts.ollama, signal),
  };
  const request = buildChatRequest(prompt, opts, resolved);

  const response = await ollamaFetch(
    `${resolved.host}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    resolved.host,
    signal,
  );
  if (!response.ok) {
    throw new ClaudeCommitError(
      await describeHttpFailure(response, resolved.host, name),
    );
  }

  let content: string;
  let final: OllamaChatChunk;
  if (request.stream) {
    ({ content, final } = await consumeStream(response, opts.onText));
  } else {
    final = (await response.json()) as OllamaChatChunk;
    if (final.error) throw new ClaudeCommitError(`Ollama: ${final.error}`);
    content = final.message?.content ?? "";
  }

  // The prompt filled the window, which means Ollama dropped whatever did
  // not fit rather than complaining. Phrase it so the pipeline's overflow
  // retry recognises it and re-splits the chunk.
  const promptTokens = promptTokensOf(final);
  if (promptTokens > 0 && promptTokens >= resolved.contextTokens) {
    throw new ClaudeCommitError(
      `Ollama truncated the request to "${name}": the prompt is too long for ` +
        `the ${resolved.contextTokens}-token context window ("ollama.context").`,
    );
  }

  if (final.done_reason === "length") {
    throw new ClaudeCommitError(
      `Ollama's reply from "${name}" was cut off at the context limit. ` +
        `Raise "ollama.context" beyond ${resolved.contextTokens}, or use ` +
        `a model with more room.`,
    );
  }

  const text = content.trim();
  if (text === "") {
    throw new ClaudeCommitError(`Ollama model "${name}" returned no text.`);
  }

  let structured: unknown;
  if (opts.outputFormat) {
    try {
      structured = JSON.parse(text);
    } catch {
      // Leave `structured` unset: the caller's fallback chain drops to a
      // plain-text attempt, which is exactly the right response to a model
      // or server that could not honour the schema (Ollama Cloud, for one,
      // does not support `format` at all).
    }
  }

  return {
    text,
    costUsd: 0,
    ...(final.model ? { model: final.model } : {}),
    ...(structured !== undefined ? { structured } : {}),
  };
}
