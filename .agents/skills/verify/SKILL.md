---
name: verify
description: Verify claude-commit changes by driving the cco CLI end-to-end on real staged changes - launch/drive recipe and gotchas.
---

# Verifying claude-commit

The surface is the `cco` CLI (`bin/cco.ts`). Tests and typecheck are CI's job;
verification means running the CLI against real staged changes.

## Recipe

1. Stage something (the change under verification works): `git add -A`
2. Happy path: `bun run bin/cco.ts --dry-run --no-spinner --verbose`
   - Prints chunk count, per-call cost, each summary, and the final message(s).
     Dry-run never commits.
   - A successful run exercises both pipeline stages (summary model and final
     model) through the Claude Agent SDK and the bundled `claude` binary.
3. Error-surface probe: add `--model-summary bogus-model-xyz` and expect a
   clean error naming the model, exit code 1. Put the bogus model on
   `--model-summary` (not `--model-final`) so the run fails before any paid
   summary call.
4. Interactive mode: `bun run bin/cco.ts --dry-run -i` (OpenTUI; needs a TTY).

## Gotchas

- Needs staged changes; the pipeline errors out otherwise.
- Requires Claude Code subscription auth; an API key is refused unless
  `allowApiKey` is enabled.
- When checking exit codes, do not pipe through `head` - `$?` reports the last
  command in the pipeline, not `cco`.
- Model aliases resolve inside the bundled `claude` binary (e.g. `sonnet` ->
  `claude-sonnet-5`). To see the resolved model, context window, and cost, run
  `./node_modules/.bin/claude -p 'Reply OK' --model <m> --output-format json`
  and read the `modelUsage` key.
