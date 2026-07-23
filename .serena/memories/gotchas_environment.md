# Environment gotchas

## "Prompt is too long" has TWO known causes - check both

1. **Broken node_modules (version skew).** If `node_modules` is missing packages (observed: both `@anthropic-ai/*` packages absent while the rest existed), `bun run` silently auto-installs/resolves them from Bun's global cache - potentially a DIFFERENT version than bun.lock pins, one that may ignore isolation options. Fix/check: `bun install --frozen-lockfile`; verify `node_modules/@anthropic-ai/claude-agent-sdk/package.json` matches the lockfile.
2. **User config leaking into the request (fixed 2026-07-23, commits 7093b4f + 43b1952).** `settingSources: []` only disables settings files/CLAUDE.md - it does NOT gate MCP servers (`~/.claude.json`, `.mcp.json`, plugins) or skill discovery (CLI discovers skills even when the `skills` option is omitted). A user with many MCP connectors leaked ~848k tokens of tool definitions into each request. Isolation now lives in `buildQueryOptions` (`src/agent.ts`): `tools: []` + `skills: []` + `mcpServers: {}` + `strictMcpConfig: true` + `plugins: []` + `settingSources: []`. Any regression here reappears as this error.

**Isolation probe:** build options via `buildQueryOptions` + `buildSubprocessEnv`, run a tiny prompt through the SDK's `query`, read `usage.input_tokens` on the `result` message. Healthy: ~170 tokens. Leaking: ~850k. (Recipe also in `.agents/skills/verify/SKILL.md`.)

Related: `clampChunkTokens` (`src/tokens.ts`) caps the chunk budget at the summary model's context window minus a 32k reserve (1M for current Sonnet/Opus/Fable + `[1m]` ids, 200k floor for Haiku/older/unknown), so oversized diffs on small-context models split instead of overflowing.

## Running `cco` from inside a Claude Code session

The shell carries `CLAUDECODE=1`, `CLAUDE_CODE_*`, `CLAUDE_EFFORT`, `CLAUDE_PID`, `AI_AGENT` etc., which the spawned `claude` binary inherits. For clean end-to-end runs, scrub them:
`UNSETS=$(env | grep -oE '^(CLAUDE_CODE_[A-Z_]+|CLAUDECODE|CLAUDE_EFFORT|CLAUDE_PID|AI_AGENT)=' | sed 's/=$//' | sed 's/^/-u /' | tr '\n' ' '); env $UNSETS bun run bin/cco.ts ...`
Note: the Claude Code Bash tool in this project runs **zsh** (chain with `&&`, not fish's `and`), despite `$SHELL` pointing at fish.
