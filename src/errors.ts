/** Error type for user-facing, expected failures (printed without a stack trace). */
export class ClaudeCommitError extends Error {
  override name = "ClaudeCommitError";
}

/**
 * True when `error` is the backend rejecting a request for exceeding the
 * model's context window. Matched on message text because the Agent SDK
 * surfaces the rejection only as an error string. Used to trigger a
 * re-split-and-retry: the rejection happens before the model runs, so it is
 * not billed.
 */
export function isPromptTooLongError(error: unknown): boolean {
  return error instanceof Error && /prompt is too long/i.test(error.message);
}
