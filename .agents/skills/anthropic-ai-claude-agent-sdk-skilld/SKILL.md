---
name: anthropic-ai-claude-agent-sdk-skilld
description: "ALWAYS use when writing code importing \"@anthropic-ai/claude-agent-sdk\". Consult for debugging, best practices, or modifying @anthropic-ai/claude-agent-sdk, anthropic-ai/claude-agent-sdk, anthropic-ai claude-agent-sdk, anthropic ai claude agent sdk, claude-agent-sdk-typescript, claude agent sdk typescript."
metadata:
  version: 0.3.263
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-09-13
---

# anthropics/claude-agent-sdk-typescript `@anthropic-ai/claude-agent-sdk@0.3.263`
**Tags:** latest: 0.3.270, next: 0.3.270

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-agent-sdk` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-agent-sdk` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes in @anthropic-ai/claude-agent-sdk v0.3.x — prioritising recent releases that introduce new APIs and breaking changes.

- NEW: `pluginDelivery: 'initialize'` option — v0.3.261 sends plugins over stdin instead of command line, fixing Windows start failures with many plugins [source](./.skilld/releases/v0.3.261.md)

- NEW: `thinkingTokens` field on `ModelUsage` — v0.3.257 exposes Claude's thinking tokens as a subset of `outputTokens`; fixes `usage.output_tokens_details.thinking_tokens` reporting 0 [source](./.skilld/releases/v0.3.257.md)

- NEW: `tool_use_result.resourceLinks` — v0.3.257 lists `resource_link` blocks returned by MCP tools on user messages, allowing hosts to render files without parsing result text [source](./.skilld/releases/v0.3.257.md)

- NEW: `resource_links` on `task_notification` — v0.3.257 lists files returned by auto-backgrounded MCP tool calls; join to the call via `tool_use_id` [source](./.skilld/releases/v0.3.257.md)

- NEW: `user_message_uuid` on turn events — v0.3.246 (expanded v0.3.260) links error results and first assistant messages to the user message that triggered them; v0.3.260 adds optional `user_message_uuid` to `thinking_tokens` system messages [source](./.skilld/releases/v0.3.246.md#what-s-changed)

- NEW: `user_message_uuids` on turn events — v0.3.259 complements `user_message_uuid` by listing every user message a turn answered, enabling replies to merged messages to be matched to each [source](./.skilld/releases/v0.3.259.md)

- NEW: `perTaskStopAffordance` option — v0.3.246 when set, `interrupt()` aborts only the current turn and keeps background agents and workflows running; otherwise (default) they all stop [source](./.skilld/releases/v0.3.246.md#what-s-changed)

- NEW: `modelUsage[*].costBasis` field — v0.3.246 reports which price table each model's `costUSD` was computed from: `'list' | 'managed' | 'unknown'` [source](./.skilld/releases/v0.3.246.md#what-s-changed)

- NEW: `ambient` flag on task entries — v0.3.247 added to `task_started`, `task_notification` and `background_tasks_changed` so hosts can exclude housekeeping tasks from activity indicators [source](./.skilld/releases/v0.3.247.md)

- NEW: `permissionPrompts: 'none'` option — v0.3.259 auto-denies permission prompts in sessions with nobody to answer them, without disabling auto mode's classifier [source](./.skilld/releases/v0.3.259.md)

- NEW: `timeout` parameter for `createSdkMcpServer()` — v0.3.248 sets a per-server timeout for SDK-hosted MCP servers, overriding `MCP_TOOL_TIMEOUT` [source](./.skilld/releases/v0.3.248.md)

- NEW: `detail` option on `Query.getContextUsage()` — v0.3.257 accepts `'summary'` (fast, uses last response's usage and local estimates) or `'full'` (default, makes per-category token-count API calls) [source](./.skilld/releases/v0.3.257.md)

- BREAKING: `rewindFiles()` error behaviour — v0.3.260 now fails when no files could be restored (e.g., checkpoint backups missing) instead of reporting success [source](./.skilld/releases/v0.3.260.md)

- CHANGED: `error_max_structured_output_retries` result format — v0.3.260 now appends the last StructuredOutput tool error; validation errors now name the offending key, allowed values, and actual length or count [source](./.skilld/releases/v0.3.260.md)

- CHANGED: `rate_limit_event` re-emission — v0.3.260 now re-emits during an exceeded window on repeat 429s (about once per 30 seconds per limit window), so stream consumers can refresh stale rate-limit state [source](./.skilld/releases/v0.3.260.md)

**Also changed:** `is_backgrounded` and `spawn_depth` on `task_started` v0.3.238 · `suppressOriginalPrompt` in `UserPromptExpansion` hook v0.3.238 · `command_lifecycle` state `refused` v0.3.238 · `managedSettings` `disableAutoMode` filter fix v0.3.260 · `modelPricing` support in `managedSettings` v0.3.246 · `total_cost_usd` includes 1.1× data-residency multiplier when `inference_geo: "us"` v0.3.239 · `classifierContext` on `PostToolUse` hook output v0.3.236 · `mcp_reconnect` and `mcp_toggle` now act on `--mcp-config` / `mcp_set_servers` instead of `.mcp.json` v0.3.257 · `mcp_set_servers` lists connection-failed servers under `added` with `failed` row v0.3.257 · Agent tool calls emit `tool_progress` heartbeat v0.3.257
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices for @anthropic-ai/claude-agent-sdk v0.3.263

## Overview

These best practices surface patterns that differ from natural assumptions and are essential for production use of the SDK. Each covers a gotcha or non-obvious optimisation specific to the Agent SDK's design.

## Best Practices

- Retrieve historical session messages using `getSessionMessages(sessionId)` before resuming — the SDK streams only new messages when a session is resumed, so callers building dashboards or exporters must fetch history explicitly [source](./.skilld/issues/issue-14.md#expected-desired-behavior)

- Override per-MCP-server `timeout` to prevent "Stream closed" errors during long tool calls — global `MCP_TOOL_TIMEOUT` is often too short, and adding explicit `timeout` in the server config stops activity-time resets from cutting off valid work [source](./.skilld/issues/issue-114.md) [source](./.skilld/releases/CHANGELOG.md:L85:87)

- Use `detail: 'summary'` when calling `getContextUsage()` to avoid issuing per-category token-count API calls — the summary mode answers from the last response's usage and local estimates, reducing latency and token overhead [source](./.skilld/releases/CHANGELOG.md:L49)

- Pass `perTaskStopAffordance: true` to distinguish graceful turn-only interrupts from full session stops — when set, `interrupt()` aborts only the current turn and keeps background agents and workflows running, enabling pausing while maintaining spawn state [source](./.skilld/releases/CHANGELOG.md:L98)

- Check the `background_tasks` array in Stop hooks to distinguish terminal session ends from pauses waiting for background work — this lets you know whether callbacks like cleanup routines should run or defer [source](./.skilld/releases/CHANGELOG.md:L88)

- Link reply frames to user inputs using the `user_message_uuid` field on assistant messages and error results — this UUID is stable across retries and is also populated on result messages, enabling reliable message tracing through a multi-turn session [source](./.skilld/releases/CHANGELOG.md:L95)

- Set `pluginDelivery: 'initialize'` when the plugin count would exceed Windows command-line limits — passing plugins over stdin instead of argv prevents launcher failures without changing any plugin definitions [source](./.skilld/releases/CHANGELOG.md:L13)

- Avoid nested subagent spawns by default — subagent nesting is capped at depth 1; if you need deeper spawning, set the environment variable `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` and manage concurrency yourself with `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` [source](./.skilld/releases/CHANGELOG.md:L244:245)

- Use streaming input carefully with background subagents — if the stream closes before all background work completes, permission callbacks (`canUseTool`) may fail permanently with "Stream closed"; delay stream closure until background_tasks_changed reports completion [source](./.skilld/issues/issue-376.md:L162:170)

- Strip the `ANTHROPIC_API_KEY` environment variable before spawning agents in untrusted contexts — the SDK's transport normally does this via `allowApiKey` gating, but verify your deployment's security model prevents credential leakage during agent execution [source](./.skilld/issues/issue-37.md)

- Monitor cache performance by inspecting `cache_creation_input_tokens` vs `cache_read_input_tokens` in response usage — the SDK uses ephemeral_1h cache writes (2× base price) by default, not the API's 5m default, so session-level tuning of cache TTL or read patterns directly impacts costs [source](./.skilld/issues/issue-197.md:L28:46)

- Load agent definitions before spawning subagents to catch configuration errors early — agent tools are registered at init time, so defining agents in the initial `options.agents` or `options.tools` block rather than in runtime MCP configs ensures the model sees all intended agents from the start [source](./.skilld/pkg/sdk.d.ts:L38:100)

- Capture model usage across all turns using `modelUsage` in the result, which accumulates costs across the session lifecycle — `total_cost_usd` on each result is a running total (not per-turn), making it safer for billing and budget tracking than summing across results [source](./.skilld/releases/CHANGELOG.md:L96)
<!-- /skilld:best-practices -->
