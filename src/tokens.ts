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
