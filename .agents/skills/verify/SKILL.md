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
- Context-isolation regression check: build options with `buildQueryOptions` +
  `buildSubprocessEnv` (`src/agent.ts`), run a tiny prompt through the SDK's
  `query`, and read `usage.input_tokens` on the `result` message. Healthy runs
  total a few hundred tokens. When reading usage, sum `input_tokens` +
  `cache_creation_input_tokens` + `cache_read_input_tokens` - Claude Code
  auto-caches the prompt, so `input_tokens` alone can read as ~10.
- Token-density check for armored content: age/gpg armor tokenizes at ~1.14
  chars/token on current models (measured 2026-07-23), not the ~3.5 of prose.
  A "Prompt is too long" error whose reported request size is ~3-4x the
  chars/4 "conversation" figure means dense content, not context leakage -
  the error's "system prompt, tool definitions, attachment content" wording
  is boilerplate, and the "conversation" number is a local chars/4 estimate.
  Reproduce armor handling cheaply with `--skip-armored` on a chezmoi-style
  staged diff.
