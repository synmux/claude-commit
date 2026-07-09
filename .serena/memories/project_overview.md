# claude-commit - Project Overview

Bun/TypeScript CLI (`cco` / `claude-commit`) that generates git commit messages from the staged diff using the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`, spawns the bundled `claude` binary).

## Pipeline

diff → `splitDiff` chunks → summary model (default `sonnet`) per chunk → final model (default `sonnet`) writes message(s). (`sonnet` resolves to Sonnet 5 with a native 1M context; the old `sonnet[1m]` suffix is vestigial and fragments the prompt-cache key.) Entry: `bin/cco.ts` → `src/cli.ts` (commander) → `src/generate.ts` → `src/agent.ts` (`runPrompt`, single-turn, tools disabled).

## Key modules

- `src/config.ts` - precedence: defaults < `package.json#claude-commit` < `.claude-commit(.rc).json` (walk cwd→repo root) < CLI flags. `sanitizePartial` validates & drops unknown/badly-typed keys.
- `src/agent.ts` - SDK wrapper; `buildSubprocessEnv` builds the subprocess env (credential gating + `CLAUDE_CODE_EXTRA_BODY` temperature injection).
- `src/ui/*` - spinner, editor confirm, OpenTUI interactive mode (`-i`).
- Tests in `test/*.test.ts` (bun:test), incl. tmpdir-based config-file tests.

## Commands

- `bun test` · `bun run typecheck` (tsc --noEmit) · `bun run lint` (trunk) · `bun run format` (prettier + trunk fmt)
- Run: `bun run bin/ --dry-run --no-spinner` (needs a repo with staged changes)
- Trunk pre-commit hook auto-formats on commit.

## Conventions

Conventional Commits + GitMoji titles; British English in docs; docs live in README.md (users) / WALKTHROUGH.md (codebase tour) / AGENTS.md=CLAUDE.md (Bun boilerplate); design specs in `docs/superpowers/specs/`.
