---
name: anthropic-ai-claude-agent-sdk-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-agent-sdk". Consult for debugging, best practices, or modifying @anthropic-ai/claude-agent-sdk, anthropic-ai/claude-agent-sdk, anthropic-ai claude-agent-sdk, anthropic ai claude agent sdk, claude-agent-sdk-typescript, claude agent sdk typescript.'
metadata:
  version: 0.3.218
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-23
---

# anthropics/claude-agent-sdk-typescript `@anthropic-ai/claude-agent-sdk@0.3.218`

**Tags:** latest: 0.3.218, next: 0.3.218

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-agent-sdk` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-agent-sdk` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritise recent major/minor releases.

- BREAKING: `set_permission_mode` now rejects unrecognized permission mode strings with an error instead of silently adopting them; only the `'manual'` alias is accepted alongside the standard modes [source](./.skilld/releases/v0.3.214.md#what's-changed)

- NEW: `AgentToolCompletedOutput` published SDK type — the Agent tool's structured result now has a matching TypeScript type for exact schema alignment [source](./.skilld/releases/v0.3.207.md#what's-changed)

- BREAKING: Subagent spawn depth cap lowered from 5 to 1 by default; nested subagents no longer spawn unless `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is set [source](./.skilld/releases/v0.3.217.md#what's-changed)

- NEW: `canonicalModel` and `provider` added to each `modelUsage` entry in result messages for billing to look up correct rate tables (accounts for provider-specific model ID mapping) [source](./.skilld/releases/v0.3.218.md#what's-changed)

- NEW: `applyFlagSettings({effortLevel})` now accepts `'max'` in TypeScript type (runtime already supported it) [source](./.skilld/releases/v0.3.214.md#what's-changed)

- NEW: `SDKAssistantMessage` now includes `timestamp` (ISO-8601) field on the live stream, matching `SDKUserMessage`; older CLI emitters omit it, so consumers should fall back to receive time [source](./.skilld/releases/v0.3.211.md#what's-changed)

- NEW: `USAGE_LIMIT_ERROR_PREFIXES` and sibling constants exported as `@alpha` exports for classifying rate-limit error messages without maintaining hand-mirrored lists [source](./.skilld/releases/v0.3.211.md#what's-changed) (experimental)

- NEW: `timedOutAfterMs` field added to tool results when a Bash command is auto-backgrounded on timeout [source](./.skilld/releases/v0.3.210.md#what's-changed)

- NEW: `still_queued` array added to interrupt control response (UUIDs of queued async messages that survive the interrupt); `Query.interrupt()` now returns typed receipt; `system/init` advertises `interrupt_receipt_v1` capability [source](./.skilld/releases/v0.3.205.md#what's-changed)

- NEW: `command_lifecycle` frames added to stream-json and SDK sessions, reporting each uuid-stamped message's terminal state (`queued`/`started`/`completed`/`cancelled`/`discarded`) — zero-API results no longer report stale `duration_api_ms` [source](./.skilld/releases/v0.3.206.md#what's-changed)

- NEW: Assistant messages truncated by `interrupt()` now carry `aborted: true` field to distinguish mid-stream partials from completed messages [source](./.skilld/releases/v0.3.214.md#what's-changed)

- NEW: `subagent_type` and `subagent_retry` fields added to `tool_progress` messages (shows subagent waiting out API rate-limit retry with attempt count) [source](./.skilld/releases/v0.3.214.md#what's-changed)

- NEW: `subkind: 'scheduled-trigger'` optional field added to `SDKMessageOrigin`'s `task-notification` member, marking deliveries as scheduled task fires [source](./.skilld/releases/v0.3.214.md#what's-changed)

- NEW: `parent_agent_id` field added to subagent session messages for building depth-2+ agent trees from disk-persisted metadata [source](./.skilld/releases/v0.3.202.md#what's-changed)

**Also changed:** `tool_result_meta` sidecar added v0.3.216 · `user_message_uuid` and `request_sent_wall_ms` added v0.3.216 · `skippedLinks` count added to `rewindFiles` v0.3.216 · Agent tool resolved model v0.3.212 · Peer-message `name` and `body` fields v0.3.205 · `background_tasks_changed` system message v0.3.203 · `'manual'` permission mode alias v0.3.200 · `requestId` to `canUseTool` options v0.3.199 · `blocked` field to `workflow_agent` events v0.3.199 · `injectHosts` to sandbox credentials v0.3.199 · Per-server `request_timeout_ms` v0.3.198
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Set `sessionStore` and enable dual-write for cloud deployments requiring state portability — the SDK writes to local disk AND your store adapter, allowing seamless migration between machines and recovery from crashes [source](./.skilld/issues/issue-3.md#top-comments)

- Set `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` to 300000ms (5 minutes) when using concurrent MCP tool calls — default 60000ms closes the stream prematurely for all pending calls, causing "Stream closed" errors mid-execution [source](./.skilld/issues/issue-41.md#top-comments)

- Use the `tools` option to specify base available tools instead of relying solely on `allowedTools` — `allowedTools` controls permissions only, not visibility; pass `tools: ['Read', 'Bash', 'Edit']` to restrict Claude to just those tools [source](./.skilld/issues/issue-19.md#top-comments)

- Isolate `ANTHROPIC_API_KEY` in the SDK process environment rather than inheriting from parent — set `env: { ...process.env, ANTHROPIC_API_KEY: secret }` to avoid accidental key leakage via tool execution or error messages [source](./.skilld/issues/issue-37.md)

- Enable `enableFileCheckpointing: true` for multi-step workflows requiring rollback — allows reverting files to their state at any user message boundary via `Query.rewindFiles()`, essential for exploratory agents [source](./.skilld/pkg/sdk.d.ts:L1465)

- Use `thinking: { type: 'adaptive' }` for Opus 4.6+ instead of fixed `maxThinkingTokens` — adaptive thinking automatically allocates reasoning budget based on task complexity, reducing costs for simple queries while preserving depth for hard problems [source](./.skilld/pkg/sdk.d.ts:L1631)

- Set `sessionStore` with `sessionStoreFlush: 'immediate'` for mission-critical workflows — batched (default) flushes only on query completion; immediate flushing survives process crashes mid-turn [source](./.skilld/pkg/sdk.d.ts:L1587)

- Redirect built-in tools to custom MCP implementations via `toolAliases` — when a tool like Bash must run in a sandbox or remote server, set `toolAliases: { Bash: 'mcp__workspace__bash' }` so model-generated calls route correctly [source](./.skilld/pkg/sdk.d.ts:L1402)

- Inspect `modelUsage[].canonicalModel` and `provider` fields to calculate accurate billing costs — v0.3.218+ includes these fields on every model usage entry, enabling lookups against the correct rate table (e.g., Claude Bedrock vs Anthropic API) [source](./.skilld/releases/v0.3.218.md)

- Use `forkSession: true` with `resume` to create an isolated branch without modifying the original session — enables safe "what-if" workflows that can be discarded without affecting parent session history [source](./.skilld/pkg/sdk.d.ts:L1481)

- Define subagents with explicit `tools` arrays instead of inheriting all tools — narrows attack surface and helps Claude understand tool scope; omit `tools` only when the subagent genuinely needs access to everything [source](./.skilld/pkg/sdk.d.ts:L46)

- Set `hooks` with `HookCallbackMatcher` matchers to gate tool execution patterns — combine `PreToolUse` and `PostToolUse` hooks to enforce approval workflows, log usage, or redirect certain tool calls to custom handlers [source](./.skilld/pkg/sdk.d.ts:L1502)

- Use `additi onalDirectories` to allow Claude access to files outside the working directory without exposing the entire filesystem — pass absolute paths only for sensitive code that must remain discoverable [source](./.skilld/pkg/sdk.d.ts:L1313)

<!-- /skilld:best-practices -->
