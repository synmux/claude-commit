#!/usr/bin/env bun
/**
 * Executable entry point for `cco` / `claude-commit`.
 */
import { run } from "../src/cli";
import { color } from "../src/ui/colors";

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // Unexpected (non-ClaudeCommitError) failures: print a stack for debugging.
    process.stderr.write(
      `${color("31", "unexpected error:")} ${err?.stack ?? err}\n`,
    );
    process.exitCode = 1;
  });
