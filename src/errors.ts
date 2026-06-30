/** Error type for user-facing, expected failures (printed without a stack trace). */
export class ClaudeCommitError extends Error {
  override name = "ClaudeCommitError";
}
