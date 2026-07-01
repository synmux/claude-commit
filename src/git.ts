/**
 * Git operations, implemented with Bun's shell (`Bun.$`).
 */
import { $ } from "bun";
import { ClaudeCommitError } from "./errors";
import type { FileChange } from "./types";

/**
 * A git command failed. Subclasses {@link ClaudeCommitError} so the CLI prints
 * it as a clean, user-facing error rather than a stack trace.
 */
export class GitError extends ClaudeCommitError {
  override name = "GitError";
}

/** Run a git command, returning stdout. Throws {@link GitError} on failure. */
async function git(args: string[]): Promise<string> {
  let res;
  try {
    res = await $`git ${args}`.quiet().nothrow();
  } catch (err) {
    // Should not happen with `.nothrow()`, but never let a raw shell error leak.
    throw new GitError(`Could not run git: ${(err as Error).message}`);
  }
  if (res.exitCode !== 0) {
    const stderr = res.stderr.toString().trim();
    throw new GitError(
      stderr || `git ${args.join(" ")} exited with code ${res.exitCode}`,
    );
  }
  return res.stdout.toString();
}

/** True if the current working directory is inside a git work tree. */
export async function isGitRepo(): Promise<boolean> {
  try {
    const res = await $`git rev-parse --is-inside-work-tree`.quiet().nothrow();
    return res.exitCode === 0 && res.stdout.toString().trim() === "true";
  } catch {
    // git missing or unrunnable — treat as "not a usable repo".
    return false;
  }
}

/** Absolute path to the repository root. */
export async function getRepoRoot(): Promise<string> {
  return (await git(["rev-parse", "--show-toplevel"])).trim();
}

/** The unified diff of staged changes (`git diff --cached`). */
export async function getStagedDiff(): Promise<string> {
  return git(["diff", "--cached", "--no-color"]);
}

/** Parsed list of staged files with their status codes. */
export async function getStagedFiles(): Promise<FileChange[]> {
  const out = await git(["diff", "--cached", "--name-status"]);
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
  return (await git(["diff", "--cached", "--stat", "--no-color"])).trimEnd();
}

/**
 * Create a commit with the given message. The message is piped to
 * `git commit -F -` over stdin, so arbitrary content (leading dashes, multiple
 * lines, special characters) is handled safely — and nothing touches disk, so
 * there is no temp file to be raced or read by another user.
 */
export async function commit(message: string): Promise<void> {
  let proc;
  try {
    // `Bun.spawn` throws synchronously if `git` isn't on PATH.
    proc = Bun.spawn(["git", "commit", "-F", "-"], {
      stdin: new TextEncoder().encode(message),
      // We surface our own confirmation, so discard git's stdout summary rather
      // than leaving an unread pipe that could (in theory) fill and block.
      stdout: "ignore",
      stderr: "pipe",
    });
  } catch (err) {
    throw new GitError(`Could not run git: ${(err as Error).message}`);
  }
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = (await new Response(proc.stderr).text()).trim();
    throw new GitError(stderr || `git commit exited with code ${exitCode}`);
  }
}

/** The current branch name (or `HEAD` when detached). */
export async function getCurrentBranch(): Promise<string> {
  return (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}
