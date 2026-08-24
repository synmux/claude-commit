# claude-commit - Project Overview

Bun/TypeScript CLI (`cco` / `claude-commit`) that generates git commit messages from the staged diff using the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`, spawns the bundled `claude` binary).

## Pipeline

diff → (skipArmored redaction) → `partitionDiff` by `lowPriorityPaths` (primary / low-priority file sections; all-low is promoted to primary) → per partition: `splitDiffToFit` chunks → summary model (default `sonnet`) per chunk with a priority-specific system prompt → final model (default `sonnet`) writes message(s) from the grouped summaries. (`sonnet` resolves to Sonnet 5 with a native 1M context.) Entry: `bin/cco.ts` → `src/cli.ts` (commander) → `src/generate.ts` → `src/agent.ts` (`runPrompt`, single-turn, tools disabled).

## Key modules

- `src/config.ts` - precedence: defaults < global `$XDG_CONFIG_HOME/claude-commit` < `package.json#claude-commit` < `.claude-commit(.rc).json` (walk cwd→repo root) < CLI flags. `sanitizePartial` validates & drops unknown/badly-typed keys. `lowPriorityPaths` (string[]) is replaced whole by the nearest layer (never merged; `[]` opts out) and copied on merge.
- `src/paths.ts` - gitignore-style matcher on `Bun.Glob` for `lowPriorityPaths`: `/` patterns match path or any ancestor dir; bare patterns match any segment; `!` negates with last-match-wins; `./`, leading/trailing `/` normalised; paths are repo-root-relative with `/`. Ill-formed patterns are parsed, not rejected (unbalanced `{` = first alternative; unterminated `[` matches nothing) - pinned by tests, surfaced by `--verbose` counts.
- `src/diff.ts` - chunking (`splitDiff`, `splitDiffToFit`), `redactOpaqueRuns`, `partitionDiff` + `sectionPaths` (parses `---/+++/rename/copy` header lines with git C-quote unescaping, falls back to `diff --git a/X b/Y` header for binary/mode-only sections; rename is low priority only if both sides match).
- `src/git.ts` - readers share `STAGED_DIFF_FLAGS` (`--cached --no-color --no-relative --no-ext-diff --ignore-submodules=none --submodule=short --src-prefix=a/ --dst-prefix=b/`): exhaustive neutralisation of `diff.relative` (also drops files outside cwd), `diff.external` (replaces diff body / forges headers), `diff.ignoreSubmodules=all` (drops submodule bumps), `diff.submodule=log` (header-less block glued to previous section), `diff.noprefix` / `diff.mnemonicPrefix`.
- `src/prompts.ts` - `buildSummarySystem(priority)`, `buildSummaryUser(chunk,i,n,priority)`, `buildFinalSystem(config, structured, hasLowPriority)` (weighting rules live in the SYSTEM prompt, config-branched: type/scope only with conventionalCommits, gitmoji only with gitmoji, body clause only with multiline), `buildFinalUser(DiffSummary[], count, structured)` (grouped headings + closing anchor; multi-option variety scoped to primary changes when both groups exist).
- `src/agent.ts` - SDK wrapper; `buildSubprocessEnv` builds the subprocess env (credential gating + `CLAUDE_CODE_EXTRA_BODY` temperature injection).
- `src/ui/*` - ora-rendered spinner (`spinner` config key, default `material`), editor confirm, OpenTUI interactive mode (`-i`).
- CLI: `--no-low-priority-paths` maps to `lowPriorityPaths: []` for one run; `--verbose` prints `low-priority paths: matched N of M files` (or none / all-promoted) and labels low-priority summaries.
- Tests in `test/*.test.ts` (bun:test), incl. tmpdir-based config-file tests, `test/paths.test.ts`, `test/git.test.ts` (real temp git repo with a submodule and diff.relative/noprefix/mnemonicPrefix/submodule=log/ignoreSubmodules=all/external all on, read from a subdirectory), stub-runner pipeline tests in `test/generate.test.ts`.

## Commands

- `bun test` · `bun run typecheck` (tsc --noEmit) · `bun run lint` (trunk) · `bun run format` (prettier + trunk fmt)
- Run: `bun run bin/ --dry-run --no-spinner` (needs a repo with staged changes)
- Trunk pre-commit hook auto-formats on commit. Commits are SSH-signed via 1Password and fail from the Bash tool - see `mem:gotchas_environment`.

## Conventions

Conventional Commits + GitMoji titles; British English in docs; docs live in README.md (users) / WALKTHROUGH.md (codebase tour) / CLAUDE.md (Bun boilerplate; NOTE: the user's global rules want CLAUDE.md to be a symlink to AGENTS.md, but this repo has a plain CLAUDE.md and no AGENTS.md); design specs in `docs/superpowers/specs/` (latest: `2026-08-24-low-priority-paths-design.md`). This repo's own `package.json#claude-commit` deprioritises `.agents/skills/*-skilld`, `.agents/skills/skilld-lock.yaml`, `bun.lock`, `.serena`.
