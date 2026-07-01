/**
 * Launching the user's `$EDITOR` to tweak a commit message, plus a tiny
 * yes/no/edit confirmation prompt for non-interactive runs in a TTY.
 */
import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { ClaudeCommitError } from "../errors";

/** Resolve the editor command, mirroring git's lookup order. */
function resolveEditor(): string {
  return (
    process.env.GIT_EDITOR || process.env.VISUAL || process.env.EDITOR || "vi"
  );
}

/** Open `initial` in the user's editor and return the saved contents. */
export async function editInEditor(initial: string): Promise<string> {
  const editor = resolveEditor();
  // Unpredictable name + exclusive create (`wx`) + owner-only perms (0o600)
  // so the temp file can't be pre-created as a symlink or read by other users.
  const file = join(tmpdir(), `claudecommit-edit-${randomUUID()}.txt`);
  try {
    await writeFile(file, initial, { mode: 0o600, flag: "wx" });
  } catch (err) {
    throw new ClaudeCommitError(
      `Could not create a temporary file to edit the message: ${(err as Error).message}`,
    );
  }
  try {
    await runEditor(editor, file);
    const edited = await readFile(file, "utf8");
    // Drop trailing whitespace/newline noise editors tend to add.
    return edited.replace(/\s+$/, "");
  } catch (err) {
    if (err instanceof ClaudeCommitError) throw err;
    throw new ClaudeCommitError(
      `Editing the commit message failed (${editor}): ${(err as Error).message}`,
    );
  } finally {
    await unlink(file).catch(() => {});
  }
}

function runEditor(editor: string, file: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // $EDITOR / $GIT_EDITOR are shell command lines that may contain flags,
    // spaces in the program path, or quoted arguments (e.g. "code --wait" or
    // "/path/with spaces/editor"). Run them through the shell exactly as git
    // does rather than naively splitting on whitespace. The file path is our
    // own (tmpdir + UUID), so double-quoting it is safe.
    const child = spawn(`${editor} "${file}"`, {
      stdio: "inherit",
      shell: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolvePromise();
      else reject(new Error(`Editor exited with code ${code}`));
    });
  });
}

export type ConfirmChoice = "yes" | "no" | "edit";

/** Prompt for [Y]es / [n]o / [e]dit. Requires an interactive stdin. */
export async function confirmCommit(): Promise<ConfirmChoice> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const answer = (
        await new Promise<string>((res) =>
          rl.question("Commit this message? [Y/n/e] ", res),
        )
      )
        .trim()
        .toLowerCase();
      if (answer === "" || answer === "y" || answer === "yes") return "yes";
      if (answer === "n" || answer === "no") return "no";
      if (answer === "e" || answer === "edit") return "edit";
      process.stderr.write("Please answer y, n, or e.\n");
    }
  } finally {
    rl.close();
  }
}
