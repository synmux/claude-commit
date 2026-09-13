# `claude-commit` for Agents

## Architecture

`cco` reads a staged diff and normally writes a commit message in two model stages.
The pipeline lives in `src/generate.ts`; everything else feeds it.

With `filenamesOnly: true` (`-f` / `--filenames-only`), it skips summarisation
and sends only paths to the final model. Ignore and priority matching still
apply. Use `diffPaths` for filename extraction and `buildFilenamesUser` for
the final prompt; never pass diff bodies or preload the summary model in
this mode. Results contain no summaries and report zero chunks.

```plaintext
git.ts ─▶ diff.ts (ignore, partition, chunk) ─▶ generate.ts ─▶ agent.ts ─▶ Claude | Ollama
                    ▲                                ▲
                paths.ts, tokens.ts             prompts.ts, config.ts
```

| Module          | Owns                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `src/agent.ts`  | `runPrompt` - the one call seam; dispatches by provider, holds Claude's SDK |
| `src/models.ts` | Model-string parsing: the `ollama:` prefix, Ollama defaults. No transport   |
| `src/ollama.ts` | Ollama's native `/api/chat` over plain `fetch`; no SDK dependency           |
| `src/diff.ts`   | Splitting, chunk packing, `applyIgnorePatterns`, `partitionDiff`            |
| `src/paths.ts`  | The gitignore-style matcher shared by `lowPriorityPaths` and `ignore`       |
| `src/tokens.ts` | Token estimation and context-window budgeting                               |
| `src/config.ts` | The layered config (defaults < global < package.json < project < flags)     |

Design records for each non-obvious feature live in
`docs/superpowers/specs/`. Read the relevant one before changing that
feature - they record what was rejected and why.

Two behaviours are load-bearing and easy to break:

- **Claude credentials are gated.** `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`
  are stripped from the SDK subprocess unless `allowApiKey` is set. Never
  widen that by accident.
- **Ollama truncates an oversized prompt silently.** Every Ollama request
  pins `options.num_ctx` and the response's token counts are checked against
  it. Do not "simplify" either half away. The number comes from
  `ollama.context`, which by default (`"auto"`) is read from `/api/ps` after
  a preload with _no_ `num_ctx` - sending one on the preload would defeat
  the probe.

## Toolchain: Node 24 + pnpm

The sources are TypeScript and run on Node's native type stripping - there is
no transpile step for development. That imposes two rules `tsc` enforces:
relative imports carry an explicit `.ts` extension, and only erasable syntax
is allowed (`erasableSyntaxOnly`: no enums, namespaces or parameter
properties). Use Node built-ins (`node:fs/promises`, `node:child_process`,
`fetch`); never reach for a runtime-specific global.

- `pnpm install` - the lockfile is `pnpm-lock.yaml`; `packageManager` pins
  pnpm and `pnpm-workspace.yaml` holds the install policy (`allowBuilds`,
  `minimumReleaseAge`). A fresh dependency may resolve one minor behind
  npm's latest because of the one-week release age.
- `node bin/cco.js` - the launcher imports `dist/bin/cco.js` when it exists,
  else `bin/cco.ts` from source. `pnpm run build` (esbuild + declaration-only
  `tsc`) is only needed for publishing; `prepublishOnly` runs it.
- `pnpm test` - vitest, `test/**/*.test.ts`. `pnpm run typecheck` -
  `tsc --noEmit`. `pnpm run lint` - trunk.

## Testing

Use `vitest` (`pnpm test`). Tests drive real code: the git tests build a
temporary repository, the picker tests drive `@clack/core` through fake
streams. Mock only what cannot run headless.

```ts
import { test, expect } from "vitest";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Terminal UI

The interactive picker is a `@clack/core` `SelectPrompt` with a pure render
function (`renderPicker` in `src/ui/interactive.ts`); the spinner is `ora`.
Everything draws on stderr so stdout stays pipe-clean. Do not use Clack's
own `spinner()`: it puts stdin in raw mode and calls `process.exit(0)` on
Ctrl-C, bypassing the CLI's two-stage abort. See
`docs/superpowers/specs/2026-09-13-node-pnpm-clack-migration-design.md`.

<!-- skilld -->

Before modifying code, evaluate each installed skill against the current task.
For each skill, determine YES/NO relevance and invoke all YES skills before proceeding.

<!-- /skilld -->
