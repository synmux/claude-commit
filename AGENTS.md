# `claude-commit` for Agents

## Architecture

`cco` reads a staged diff and normally writes a commit message in two model stages.
The pipeline lives in `src/generate.ts`; everything else feeds it.

With `filenamesOnly: true` (`-f` / `--filenames-only`), it skips summarisation
and sends only paths to the final model. Ignore and priority matching still
apply. Use `diffPaths` for filename extraction and `buildFilenamesUser` for
the final prompt; never pass diff bodies or call the summary model in
this mode. Results contain no summaries and report zero chunks.

```plaintext
git.ts ─▶ diff.ts (ignore, redact, partition, chunk) ─▶ generate.ts ─▶ agent.ts ─▶ Claude
                    ▲                                        ▲
                paths.ts, tokens.ts                     prompts.ts, config.ts
```

| Module                | Owns                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/agent.ts`        | `runPrompt` - the one call seam; holds Claude's Agent SDK                                                |
| `src/commit-style.ts` | Opt-in COMMITS.md consent, history analysis and exclusive file creation                                  |
| `src/diff.ts`         | Splitting, chunk packing, `applyIgnorePatterns`, `partitionDiff`, `redactOpaqueRuns` by `armorAlphabets` |
| `src/paths.ts`        | The gitignore-style matcher shared by `lowPriorityPaths` and `ignore`                                    |
| `src/tokens.ts`       | Token estimation and context-window budgeting                                                            |
| `src/config.ts`       | The layered config (defaults < global < package.json < project < flags) and its repository-layer limits  |
| `src/generate.ts`     | The pipeline, plus the `--verbose` report both CLI flows print (`describeVerboseRun`)                    |
| `src/typesafe.ts`     | The optional Jev candidate check: questions, ranking, `@typesafe-ai/sdk` call                            |
| `src/prompts.ts`      | Every prompt: summary, final, filenames-only and multi-option builders                                   |
| `src/gitmoji.ts`      | The gitmoji guide and the gitmoji-to-type fit check                                                      |
| `src/git.ts`          | `spawn("git", ...)`: staged diff (`--no-textconv` unless asked), stat, history, `git commit -F -`        |
| `src/ui/`             | Clack picker, readline prompts, `canPrompt` and `$EDITOR` (`editor.ts`), `ora` spinner                   |

Design records for each non-obvious feature live in
`docs/superpowers/specs/`. Read the relevant one before changing that
feature - they record what was rejected and why.

For commit-style changes, read `docs/superpowers/specs/2026-11-16-commit-styles-design.md`.
`models.commits` defaults to null (off). Setup runs after staging and diff capture;
validate the model before reading COMMITS.md. Carry style as generation context,
not config. Null formatting options defer to an active guide; without a guide
they retain the legacy false behavior. Never send a user turn during model discovery.

These behaviours are load-bearing and easy to break:

- **Claude credentials and textconv are gated.** `ANTHROPIC_API_KEY` /
  `ANTHROPIC_AUTH_TOKEN` are stripped from the SDK subprocess unless
  `allowApiKey` is set, and the staged-diff readers pass `--no-textconv`
  unless `textconv` is set (a decrypting driver would hand plaintext secrets
  to the model). Only user-controlled config - the global file, a `--config`
  file, a flag - can turn either on; `restrictRepositoryLayer` in
  `src/config.ts` strips a `true` from `package.json` and project files.
  Every widening is a decision for the user, never a side effect.
- **One rule decides whether cco can prompt.** Every prompt reads stdin and
  draws on stderr, so `canPrompt()` in `src/ui/editor.ts` checks exactly
  those two; stdout carries only `--dry-run` output. `$EDITOR` follows:
  `editorStdio` sends its screen to stderr when stdout is redirected.
- **Estimation is broad, redaction is narrow.** `isOpaqueLine` (token
  estimates) counts any 40+ character space-free line as dense, because
  over-reserving is harmless. `redactOpaqueRuns` deletes content, so it
  drops only runs of one `armorAlphabets` alphabet.
- **A failed model run reports what the stream said.** `runPrompt` treats a
  `success` result with `is_error` as a failure, and its `reportedFailure`
  outranks the SDK's later "process exited" error, so "Prompt is too long"
  reaches the overflow retry and known error codes keep their advice.
- **A failed TypeSafe check must never look like a pass.** A missing key
  with `typesafe.enable` on is an error before any model call. A missing
  answer throws, and an API failure is reported to the user. Jev returns
  typed answers, not text, so it does not go through `runPrompt`.
- **A readline prompt must settle when stdin closes.** In a terminal,
  readline owns Ctrl-C (raw mode, no SIGINT reaches the process) and closes
  itself, as it does on Ctrl-D. Ask through `askLine` in `src/ui/editor.ts`,
  which resolves `null` on `close`; a bare `rl.question` never settles, the
  event loop drains and Node exits 0 with nothing printed.

## Toolchain: Node 26 + pnpm

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
  `tsc`) is only needed for publishing; `prepublishOnly` runs it. A leftover
  `dist/` silently shadows your changes, so try them with `node bin/cco.ts`.
- `pnpm test` - vitest, `test/**/*.test.ts`. `pnpm run lint:types` -
  `tsc --noEmit`. `pnpm run lint` - `trunk check -a`, which exits 1 on any
  finding (pnpm then prints `ELIFECYCLE`; that is the status, not a crash).
- `pnpm run format` - Prettier, then biome, then `trunk fmt`, deliberately
  in that order: Prettier formats what it can and trunk cleans up. Use the
  script, not Prettier alone - the two disagree on print width, and `lint`
  reports Prettier-only output as unformatted. It also rewrites the mirrored
  skill trees (`.github/skills`, `.kilo/skills`, `.skills`); keep a change
  focused by running the same three formatters on just the files you touched,
  or restore those trees afterwards.

## Testing

Use `vitest` (`pnpm test`). Tests drive real code: the git tests build a
temporary repository, the picker tests drive `@clack/core` through fake
streams. Mock only what cannot run headless. A bug fix starts with a test
that fails on the bug.

`runPrompt` and `validateCommitStyleModel` take the SDK's `query` as an
optional last argument; tests pass a stand-in stream. Without one the real
`query` spawns Claude and bills the user, so a test that runs for seconds has
reached the network.

## Terminal UI

The interactive picker is a `@clack/core` `SelectPrompt` with a pure render
function (`renderPicker` in `src/ui/interactive.ts`); the spinner is `ora`.
Everything draws on stderr so stdout stays pipe-clean (see `canPrompt` above). Do not use Clack's
own `spinner()`: it puts stdin in raw mode and calls `process.exit(0)` on
Ctrl-C, bypassing the CLI's two-stage abort. See
`docs/superpowers/specs/2026-09-13-node-pnpm-clack-migration-design.md`.

<!-- skilld -->

Before modifying code, evaluate each installed skill against the current task.
For each skill, determine YES/NO relevance and invoke all YES skills before proceeding.

<!-- /skilld -->
