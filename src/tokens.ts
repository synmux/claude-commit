/**
 * Lightweight token estimation.
 *
 * We deliberately avoid a real tokenizer here: chunking only needs a rough,
 * conservative estimate to decide where to split a diff, and pulling in a
 * tokenizer (or a network round-trip to `count_tokens`) would add weight and
 * latency for no real benefit. We slightly over-estimate tokens so that chunks
 * stay safely under the model's context window.
 */

/** Estimate the number of tokens in `text` given a chars-per-token ratio. */
export function estimateTokens(text: string, charsPerToken: number): number {
  if (charsPerToken <= 0) throw new Error("charsPerToken must be positive");
  return Math.ceil(text.length / charsPerToken);
}

/** Convert a token budget into an approximate character budget. */
export function tokensToChars(tokens: number, charsPerToken: number): number {
  return Math.floor(tokens * charsPerToken);
}

/**
 * Models with a native (or explicitly requested) 1M-token context window:
 * current-generation Sonnet/Opus (4.6 and later), Fable/Mythos, the bare
 * `sonnet` / `opus` aliases (which resolve to current-generation models), and
 * any id carrying the legacy `[1m]` long-context suffix.
 *
 * Everything else - Haiku, pre-4.6 pinned ids, unknown or custom models -
 * gets the conservative 200k floor. Worst case we split the diff into more
 * chunks than strictly necessary, which is always safe; assuming 1M for a
 * 200k model would instead fail the whole run with "Prompt is too long".
 */
const MILLION_TOKEN_CONTEXT_MODELS =
  /\[1m\]|^(claude-)?(sonnet|opus)$|sonnet-5|sonnet-4-6|opus-4-[678]|fable|mythos/i;

/** The context window (input token capacity) for a model name or alias. */
export function contextWindowTokens(model: string): number {
  return MILLION_TOKEN_CONTEXT_MODELS.test(model) ? 1_000_000 : 200_000;
}

/**
 * Tokens reserved out of the context window before sizing diff chunks: the
 * system prompt, the Agent SDK's scaffolding, and room for the response.
 * Generous on purpose - `charsPerToken` is an estimate, and a chunk that
 * overflows the window fails the whole run.
 */
export const CONTEXT_RESERVE_TOKENS = 32_000;

/**
 * Clamp a configured per-chunk token budget so that one chunk plus overhead
 * always fits the given model's context window. The configured
 * `maxChunkTokens` remains the user-facing cap; this only ever lowers it.
 */
export function clampChunkTokens(
  model: string,
  maxChunkTokens: number,
): number {
  return Math.min(
    maxChunkTokens,
    contextWindowTokens(model) - CONTEXT_RESERVE_TOKENS,
  );
}

/**
 * Chars-per-token for "opaque" content: base64/base85 armor (age, gpg, git
 * binary patches), long hashes, and similar high-entropy runs. Measured
 * against the live API on age-armor diff content (2026-07-23): ~1.14
 * chars/token - the current Claude tokenizer finds almost no merges in
 * random base64. Note that generic BPE vocabularies (tiktoken-class)
 * compress base64 roughly 3x better, so swapping in a third-party "real"
 * tokenizer would underestimate this content class just like a plain
 * chars/3.5 heuristic does. 1.0 leaves a small safety margin under the
 * measured value.
 */
export const OPAQUE_CHARS_PER_TOKEN = 1.0;

/**
 * A diff line whose content (after an optional one-character diff marker) is
 * one long unbroken run with no whitespace - the signature of encoded blobs
 * rather than prose or code. Misclassifying dense text (e.g. minified JS) as
 * opaque merely over-reserves, which is the safe direction.
 */
const OPAQUE_LINE = /^[+\- ]?\S{40,}$/;

/** Whether a single diff line should be estimated at the opaque ratio. */
export function isOpaqueLine(line: string): boolean {
  return OPAQUE_LINE.test(line);
}

/**
 * Estimate tokens for diff text with per-line content classification:
 * opaque lines at {@link OPAQUE_CHARS_PER_TOKEN}, everything else at the
 * configured `charsPerToken`. A single blended ratio underestimates
 * armor-heavy diffs more than threefold, which is exactly how a chunk that
 * looks within budget can overflow the model's real context window.
 */
export function estimateDiffTokens(
  text: string,
  charsPerToken: number,
): number {
  if (charsPerToken <= 0) throw new Error("charsPerToken must be positive");
  let tokens = 0;
  for (const line of text.split("\n")) {
    const lineChars = line.length + 1; // account for the newline
    tokens +=
      lineChars / (isOpaqueLine(line) ? OPAQUE_CHARS_PER_TOKEN : charsPerToken);
  }
  return Math.ceil(tokens);
}
