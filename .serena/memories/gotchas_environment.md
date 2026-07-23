# Environment gotchas

## "Prompt is too long" - the REAL causes (updated 2026-07-24)

The error's wording is a trap: "this conversation is only ~X tokens - the rest is system prompt, tool definitions, and attachment content" reports a **local chars/4 estimate** as "conversation" and the API's **real count** as "the request". When the two diverge ~4x, the cause is token DENSITY, not context bloat - do not go hunting for MCP/skill leakage first.

1. **Armored/encoded diff content tokenizes at ~1 char/token** (measured live 2026-07-23: 100k chars of age armor = 87,589 tokens = 1.14 c/t; the configured `charsPerToken` 3.5 underestimates >3x). This caused BOTH July incidents (chezmoi `re-add` re-encrypts age files nondeterministically → megabytes of churned armor). Fixed by `estimateDiffTokens` (opaque-line classification at ~1 c/t), `splitDiffToFit` (per-chunk verified sizing), the overflow retry queue in `generate.ts` (backend rejection is free → halve + re-split), and `--skip-armored`/`skipArmored` (redacts armor runs; the user's chezmoi repo carries `.claude-commit.json` with it enabled). NOTE: third-party tokenizers (tiktoken o200k etc.) compress base64 ~3x better than Claude's actual tokenizer, so a "real tokenizer" dependency would NOT fix this class.
2. **Broken node_modules (version skew).** Bun silently auto-resolves missing `@anthropic-ai/*` packages from its global cache at a different version than bun.lock. Check `node_modules/@anthropic-ai/claude-agent-sdk/package.json` against the lockfile; fix with `bun install --frozen-lockfile`.
3. **User config leakage was suspected (2026-07-23) but never the actual cause** - probes with `buildQueryOptions` measure ~170 input tokens in any cwd. The layered isolation (`strictMcpConfig`, `skills: []`, etc.) stays as hygiene; the SDK does load MCP/skills by default without it.

**Probes** (recipes in `.agents/skills/verify/SKILL.md`): isolation probe reads usage from a tiny `query()` - SUM input + cache_creation + cache_read (Claude Code auto-caches; `input_tokens` alone can read ~10). Density probe: send a known-size armor slice, compute chars/totalInput.

## Running `cco` from inside a Claude Code session

The shell carries `CLAUDECODE=1`, `CLAUDE_CODE_*`, `CLAUDE_EFFORT`, `CLAUDE_PID`, `AI_AGENT` etc., which the spawned `claude` binary inherits. For clean end-to-end runs, scrub them:
`UNSETS=$(env | grep -oE '^(CLAUDE_CODE_[A-Z_]+|CLAUDECODE|CLAUDE_EFFORT|CLAUDE_PID|AI_AGENT)=' | sed 's/=$//' | sed 's/^/-u /' | tr '\n' ' '); env $UNSETS bun run bin/cco.ts ...`
Note: the Claude Code Bash tool in this project runs **zsh** (chain with `&&`, not fish's `and`), despite `$SHELL` pointing at fish.

## User's install + test bed

`~/.bun/bin/cco` symlinks through `~/.bun/install/global/node_modules/@synmux/claude-commit/` into THIS REPO - the user runs live source, so repo changes are immediately live for them (but npm publishing is still needed for other machines). Real-world armor repro: the chezmoi source repo at `~/.local/share/chezmoi` (their `~/.claude.json` and other encrypted dotfiles churn on every `chezmoi re-add`).
