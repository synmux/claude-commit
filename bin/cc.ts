#!/usr/bin/env bun
/**
 * Executable entry point for `cc` / `claudecommit`.
 */
import { run } from "../src/cli";

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // Unexpected (non-ClaudeCommitError) failures: print a stack for debugging.
    process.stderr.write(
      `\x1b[31munexpected error:\x1b[0m ${err?.stack ?? err}\n`,
    );
    process.exitCode = 1;
  });
