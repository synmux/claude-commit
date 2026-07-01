# Environment gotchas

## Bun auto-install masks a broken node_modules

If `node_modules` is missing packages (observed: both `@anthropic-ai/*` packages absent while the rest existed), `bun run` silently auto-installs/resolves them from Bun's global cache — potentially a DIFFERENT version than bun.lock pins. Symptom seen: every `cc` run failed with SDK error "Prompt is too long" regardless of input; fixed by `bun install --frozen-lockfile`. When runtime behaviour makes no sense, verify `node_modules/@anthropic-ai/claude-agent-sdk/package.json` exists and matches the lockfile before debugging code.

## Running `cc` from inside a Claude Code session

The shell carries `CLAUDECODE=1`, `CLAUDE_CODE_*`, `CLAUDE_EFFORT`, `AI_AGENT` etc., which the spawned `claude` binary inherits. For clean end-to-end runs, scrub them:
`UNSETS=$(env | grep -oE '^(CLAUDE_CODE_[A-Z_]+|CLAUDECODE|CLAUDE_EFFORT|AI_AGENT)=' | sed 's/=$//' | sed 's/^/-u /' | tr '\n' ' '); env $UNSETS ... bun run bin/cc.ts ...`
(In this session the real failure turned out to be the node_modules issue above, but scrubbing keeps runs representative of a user shell.)
