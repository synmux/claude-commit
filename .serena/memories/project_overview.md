# claude-commit - Project Overview

Node 26 / TypeScript CLI (`cco` / `claude-commit`) that generates git commit messages from the staged diff using the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`, spawns the bundled `claude` binary) and/or Ollama. Migrated off Bun and OpenTUI on 2026-09-13 (design: `docs/superpowers/specs/2026-09-13-node-pnpm-clack-migration-design.md`).

## Toolchain

- pnpm 12 (`packageManager` field; policy in `pnpm-workspace.yaml`: `allowBuilds`, `minimumReleaseAge: 10080` = one week, `childConcurrency: 16`). A lockfile produced before the policy existed is rejected - delete it and re-resolve rather than exempting packages.
- Sources run unbuilt via Node's native type stripping: relative imports carry `.ts` extensions, `erasableSyntaxOnly` (no parameter properties), `package.json` imported `with { type: "json" }`.
- `bin/cco.js` (plain JS launcher) imports `dist/bin/cco.js` if present else `bin/cco.ts`. `pnpm run build` = esbuild (both entries, `--outbase=.`) + `tsc -p tsconfig.build.json` (declarations only, `rewriteRelativeImportExtensions`) → `dist/`; gitignored; only `prepublishOnly` needs it. A stale `dist/` shadows the sources.
- Tests: vitest (`pnpm test`, ~490 tests as of 2026-10-20); typecheck `pnpm run lint:types` (`tsc --noEmit`); `pnpm run lint` = `trunk check -a` (exit 1 on findings); `pnpm run format` = prettier, then biome, then `trunk fmt`, in that order - use the script, not prettier alone.
- mise pins only Node (version in `mise.toml`, currently 26.11.1); `engines` is `^26.11.1`.

## Pipeline

diff → (skipArmored redaction) → `partitionDiff` by `lowPriorityPaths` → per partition: `splitDiffToFit` chunks → summary model per chunk → final model writes message(s). `filenamesOnly` skips summarisation. Entry: `bin/cco.js` → `bin/cco.ts` → `src/cli.ts` (commander) → `src/generate.ts` → `src/agent.ts` (`runPrompt`, dispatches Claude SDK vs `src/ollama.ts`).

## Key modules

- `src/config.ts` - precedence: defaults < global `$XDG_CONFIG_HOME/claude-commit` < `package.json#claude-commit` < `.claude-commit(.rc).json` (walk cwd→repo root) < CLI flags. Files read with `node:fs/promises` (`stat().isFile()` + `readFile`).
- `src/paths.ts` - gitignore-style matcher on `picomatch` (`dot: true`): `/` patterns match path or any ancestor dir; bare patterns match any segment; `!` negates, last match wins. Ill-formed patterns never throw: unbalanced `{` matches nothing, unterminated `[` matches its literal text (pinned in `test/paths.test.ts`).
- `src/git.ts` - `spawn("git", …)` with uncapped buffering, exit code read on `close`; readers share `STAGED_DIFF_FLAGS` (neutralise `diff.relative/external/ignoreSubmodules/submodule/noprefix/mnemonicPrefix`); commit pipes the message to `git commit -F -`.
- `src/ui/interactive.ts` - Clack picker: `@clack/core` `SelectPrompt` with pure exported `renderPicker()`, `limitOptions` windowing from `@clack/prompts`, `e`/`q` via `prompt.on("key")` setting `prompt.state`; output on stderr; readline fallback kept. Never use Clack's `spinner()` (raw mode + `process.exit(0)` on Ctrl-C); the spinner stays `ora`.
- `src/ui/editor.ts` - `$EDITOR` launch (an editor killed by a signal rejects) and the readline prompts; `askLine` resolves `null` when the interface closes (Ctrl-C/Ctrl-D), which callers treat as "no"/cancel.
- `src/ollama.ts` - native `/api/chat`; `"auto"` context probes `/api/ps` after a preload (model names compared with `:latest` filled in; a zero `keep_alive` is left off the preload because empty messages + 0 means unload).
- Tests in `test/*.test.ts` (vitest); `test/git.test.ts` builds a real temp repo (submodule, hostile diff config) via `execFile`; `test/interactive.test.ts` drives the real Clack prompt through a `PassThrough` input and a collecting `Writable` with `columns`/`rows` (wait 80 ms after a lone ESC).

## Commands

- `pnpm test` · `pnpm run lint:types` · `pnpm run lint` (trunk) · `pnpm run format` · `pnpm run build` · `node bin/cco.js --dry-run --no-spinner` (needs staged changes)
- Trunk pre-commit hook checks changed files on commit. Commits are SSH-signed via 1Password; agents commit with `git -c commit.gpgsign=false commit ...` (never edit the config) - see `mem:gotchas_environment`.

## Conventions

Conventional Commits + GitMoji titles; British English in docs; docs live in README.md (users) / AGENTS.md (agent context; CLAUDE.md is a symlink to it) / TODO.md (open work); design specs in `docs/superpowers/specs/`. This repo's own `package.json#claude-commit` deprioritises `.agents/**`, `.claude/**`, `pnpm-lock.yaml`, `.serena`. skilld reference skills live under `.claude/skills` and `.agents/skills` (lock: `skilld-lock.yaml`); `skilld add npm:<pkg>` crashes on some registry metadata (verkit semver on a date string) and leaves a dangling skill dir without a lock entry - delete it.
