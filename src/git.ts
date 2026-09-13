/**
 * Git operations, implemented on `node:child_process`. Every call spawns
 * `git` directly (no shell), streams its output into memory without a size
 * cap - a staged diff can run to megabytes - and reports failure through
 * {@link GitError}.
 */
import { spawn } from "node:child_process";
import { ClaudeCommitError } from "./errors.ts";
import type { FileChange } from "./types.ts";

/**
 * A git command failed. Subclasses {@link ClaudeCommitError} so the CLI prints
 * it as a clean, user-facing error rather than a stack trace.
 */
export class GitError extends ClaudeCommitError {
  override name = "GitError";
}

/** What a finished `git` process left behind. */
interface GitProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn `git` with `args`, optionally feeding `input` to its stdin, and
 * collect both output streams in full. Rejects only when the process could
 * not be started at all (typically `git` missing from `PATH`); a non-zero
 * exit is reported through the result, not thrown.
 */
function runGit(args: string[], input?: string): Promise<GitProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    // `close` (not `exit`) waits for both pipes to drain, so nothing git
    // wrote in its final moments is lost.
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      resolvePromise({
        // A signal-terminated process has no exit code; treat it as failure.
        exitCode: code ?? (signal ? 128 : 1),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });

    // If git exits before reading everything, the write fails with EPIPE;
    // the exit code and stderr already tell the story, so swallow it. With
    // no input, stdin is closed at once so git never waits on it.
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
}

/** Run a git command, returning stdout. Throws {@link GitError} on failure. */
async function git(args: string[], input?: string): Promise<string> {
  let result: GitProcessResult;
  try {
    result = await runGit(args, input);
  } catch (err) {
    throw new GitError(`Could not run git: ${(err as Error).message}`);
  }
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    throw new GitError(stderr || `git ${args.join(" ")} exited with code ${result.exitCode}`);
  }
  return result.stdout;
}

/** True if the current working directory is inside a git work tree. */
export async function isGitRepo(): Promise<boolean> {
  try {
    const result = await runGit(["rev-parse", "--is-inside-work-tree"]);
    return result.exitCode === 0 && result.stdout.trim() === "true";
  } catch {
    // git missing or unrunnable - treat as "not a usable repo".
    return false;
  }
}

/** Absolute path to the repository root. */
export async function getRepoRoot(): Promise<string> {
  return (await git(["rev-parse", "--show-toplevel"])).trim();
}

/**
 * Flags that pin the shape and membership of every staged-change reader
 * against user diff settings. The list is exhaustive, not illustrative:
 *
 * - `--no-relative`: with `diff.relative=true`, running from a subdirectory
 *   would both strip leading path segments (breaking `lowPriorityPaths`
 *   matching, which is always repository-root-relative) and omit staged
 *   files outside that directory entirely, so the message would describe a
 *   subset of what gets committed.
 * - `--no-ext-diff`: `diff.external` / `GIT_EXTERNAL_DIFF` / a gitattributes
 *   `diff=<driver>` replace the diff body wholesale - a difftastic-style
 *   driver emits no `diff --git` headers at all, and a driver can even forge
 *   headers that attach one file's changes to another path.
 * - `--ignore-submodules=none`: `diff.ignoreSubmodules=all` erases a staged
 *   submodule bump from all three readers.
 * - `--submodule=short`: `diff.submodule=log|diff` replace a submodule's
 *   `diff --git` section with a header-less `Submodule <path> <a>..<b>:`
 *   block, which the section splitter would glue onto the preceding file's
 *   section (and priority).
 * - The `a/`/`b/` prefixes are forced so `diff.noprefix` /
 *   `diff.mnemonicPrefix` cannot change the header format the diff parser
 *   (`sectionPaths` in `src/diff.ts`) expects.
 */
const STAGED_DIFF_FLAGS = [
  "--cached",
  "--no-color",
  "--no-relative",
  "--no-ext-diff",
  "--ignore-submodules=none",
  "--submodule=short",
  "--src-prefix=a/",
  "--dst-prefix=b/",
];

/** The unified diff of staged changes (`git diff --cached`), repository-root-relative. */
export async function getStagedDiff(): Promise<string> {
  return git(["diff", ...STAGED_DIFF_FLAGS]);
}

/** Parsed list of staged files with their status codes. */
export async function getStagedFiles(): Promise<FileChange[]> {
  const out = await git(["diff", ...STAGED_DIFF_FLAGS, "--name-status"]);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0] ?? "";
      // For renames/copies (`R100\told\tnew`) the destination is the last field.
      const path = parts[parts.length - 1] ?? "";
      return { status, path };
    });
}

/** Stage every change in the work tree (`git add -A`). */
export async function stageAll(): Promise<void> {
  await git(["add", "-A"]);
}

/** A short one-line stat summary of staged changes (for display). */
export async function getStagedStat(): Promise<string> {
  return (await git(["diff", ...STAGED_DIFF_FLAGS, "--stat"])).trimEnd();
}

/**
 * Create a commit with the given message. The message is piped to
 * `git commit -F -` over stdin, so arbitrary content (leading dashes, multiple
 * lines, special characters) is handled safely - and nothing touches disk, so
 * there is no temp file to be raced or read by another user. Git's own
 * stdout summary is discarded: the CLI prints its own confirmation.
 */
export async function commit(message: string): Promise<void> {
  await git(["commit", "-F", "-"], message);
}

/** The current branch name (or `HEAD` when detached). */
export async function getCurrentBranch(): Promise<string> {
  return (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}
