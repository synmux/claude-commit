---
name: anthropic-ai-claude-agent-sdk-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-agent-sdk". Consult for debugging, best practices, or modifying @anthropic-ai/claude-agent-sdk, anthropic-ai/claude-agent-sdk, anthropic-ai claude-agent-sdk, anthropic ai claude agent sdk, claude-agent-sdk-typescript, claude agent sdk typescript.'
metadata:
  version: 0.3.201
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-06
---

# anthropics/claude-agent-sdk-typescript `@anthropic-ai/claude-agent-sdk@0.3.201`

**Tags:** latest: 0.3.201, next: 0.3.201

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-agent-sdk` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-agent-sdk` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

## Breaking Changes

- BREAKING: `unstable_v2_createSession()`, `unstable_v2_resumeSession()`, `unstable_v2_prompt()`, `SDKSession`, and `SDKSessionOptions` removed in v0.3.142 — use `query()` with `AsyncIterable<SDKUserMessage>` for multi-turn or `options.resume` to continue sessions [source](./.skilld/releases/CHANGELOG.md:L248)

- BREAKING: MCP servers now connect in background by default (v0.3.142); sessions start immediately with slow servers reporting `status: "pending"` in `init`. Set `MCP_CONNECTION_NONBLOCKING=0` to restore old behaviour or mark a server `alwaysLoad: true` to require it in turn 1 [source](./.skilld/releases/CHANGELOG.md:L249)

- BREAKING: Switched from `TodoWrite` tool to Task tools (`TaskCreate` / `TaskUpdate` / `TaskGet` / `TaskList`) in v0.3.142; tool consumers must accumulate by task ID instead of replacing snapshot lists [source](./.skilld/releases/CHANGELOG.md:L250)

- BREAKING: `options.env` now replaces `process.env` for CLI subprocess instead of merging (v0.2.121); pass `env: { ...process.env, MY_VAR: "x" }` to override specific variables [source](./.skilld/releases/CHANGELOG.md:L380)

## New APIs & Notable Additions

- NEW: `Query.reinitialize()` (v0.3.195) — re-send initialize control request and redeliver pending permission/dialog prompts after transport gaps [source](./.skilld/releases/v0.3.195.md:L14)

- NEW: `old_source` field on `NotebookEdit` tool results (v0.3.191) — enables inline diffs for `replace` and `delete` operations [source](./.skilld/releases/v0.3.191.md:L11)

- NEW: `rewind_conversation` control request (v0.3.186) — rewind conversation to a previous point with durable resume anchor support [source](./.skilld/releases/v0.3.186.md:L53)

- NEW: `ReadMcpResourceDirTool` (v0.3.186) — dedicated tool type for MCP resource directory listing (previously a fallback inside `ReadMcpResourceTool`) [source](./.skilld/releases/v0.3.186.md:L52)

- NEW: `agent_id` field on `can_use_tool` control requests (v0.3.186) — background agents now forward permission prompts to `canUseTool` instead of auto-denying; stdin stays open while background tasks run [source](./.skilld/releases/v0.3.186.md:L51)

- NEW: `tool_use_meta` sidecar on assistant messages (v0.3.179) — provides display-friendly names for tool calls; includes `icon_url` from MCP server metadata (v0.3.181) [source](./.skilld/releases/v0.3.179.md:L11) [source](./.skilld/releases/v0.3.181.md:L74)

- NEW: Rate limit fields on `SDKRateLimitInfo` (v0.3.191, v0.3.181) — `seven_day_overage_included` for weekly limits, `model_scoped` array for per-model windows, `errorCode`, `canUserPurchaseCredits`, and `hasChargeableSavedPaymentMethod` for credits-required detection [source](./.skilld/releases/v0.3.191.md:L13) [source](./.skilld/releases/v0.3.181.md:L72)

- NEW: `system/model_fallback` for all triggers (v0.3.174) — expanded from `model_not_found` to include `overloaded`, `server_error`, `last_resort`, and `permission_denied`; message `trigger` field gains new values [source](./.skilld/releases/v0.3.174.md:L10)

- NEW: `skipMcpDiscovery: true` option per plugin (v0.3.172) — allows hosts managing plugin MCP connections to load skills/hooks without re-reading `.mcp.json` [source](./.skilld/releases/v0.3.172.md:L11)

- NEW: Claude Fable 5 model (v0.3.170) — added `claude-fable-5` model ID and `fable` alias to SDK model types [source](./.skilld/releases/v0.3.170.md:L11)

- NEW: `SSEOptions` for `BrowserQueryOptions` (v0.3.169) — alternative to WebSocket transport for browser SDK consumers [source](./.skilld/releases/CHANGELOG.md:L133)

- NEW: `stop_task` success for absent tasks (v0.3.163) — control requests now return success when target task is `not_found` or `not_running`, enabling reliable stale task chip pruning [source](./.skilld/releases/CHANGELOG.md:L157)

- NEW: `stop_reason: "refusal"` on assistant messages (v0.3.162) — refusal error messages carry `stop_reason` and `stop_details`, allowing SDK consumers to detect refusals without text-matching [source](./.skilld/releases/CHANGELOG.md:L163)

- NEW: Idempotent `initialize` control request (v0.3.161) — second `initialize` returns same success payload instead of error; `ControlResponse` gains optional `pending_permission_requests` field [source](./.skilld/releases/CHANGELOG.md:L168)

- NEW: `reloadSkills: true` in `SessionStart` hook output (v0.3.152) — hooks can trigger skill re-scans; hooks can also set `sessionTitle` via `hookSpecificOutput` [source](./.skilld/releases/CHANGELOG.md:L205)

- NEW: `MessageDisplay` hook event (v0.3.152) — allows hooks to transform or hide assistant message text as displayed [source](./.skilld/releases/CHANGELOG.md:L206)

- NEW: `api_retry` system message (v0.3.150) — reports `error: 'overloaded'` for 529 responses (instead of `'rate_limit'`); consumers handling 529 should match both or check `error_status` [source](./.skilld/releases/CHANGELOG.md:L214)

- NEW: `model_not_found` error for unavailable models (v0.3.144) — assistant messages report `error: 'model_not_found'` when selected model doesn't exist or isn't available [source](./.skilld/releases/CHANGELOG.md:L239)

- NEW: `extractFromBunfs()` export (v0.3.144) — for `bun build --compile` consumers: import platform binary with `with { type: 'file' }`, extract, and pass to `options.pathToClaudeCodeExecutable` [source](./.skilld/releases/CHANGELOG.md:L240)

- NEW: `prompt_id` field on hook inputs (v0.3.196) — correlates hook events with OpenTelemetry prompt-level events [source](./.skilld/releases/v0.3.196.md:L9)

- NEW: `promptSuggestions` option to Browser SDK `query()` (v0.3.193) — allows opting remote CLI into follow-up suggestions [source](./.skilld/releases/v0.3.193.md:L23)

- NEW: `sandbox.credentials` to SDK settings (v0.3.187) — configures credential file and environment variable denial in sandboxed commands [source](./.skilld/releases/v0.3.187.md:L47)

## Deprecated APIs

- DEPRECATED: `TodoWrite` tool (v0.2.136) — switch to Task tools (`TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList`) [source](./.skilld/releases/CHANGELOG.md:L278)

- DEPRECATED: Passing `'Skill'` in `allowedTools` (v0.2.133) — use the `skills` option instead [source](./.skilld/releases/CHANGELOG.md:L291)

- DEPRECATED: `updatedMCPToolOutput` in `PostToolUseHookSpecificOutput` — use `updatedToolOutput` instead [source](./.skilld/releases/CHANGELOG.md:L341)

## Experimental APIs

- `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` (experimental) on `Query` (v0.3.169) — returns structured session cost, plan rate-limit, and local usage-behaviors data; API contract not yet stable [source](./.skilld/releases/CHANGELOG.md:L132)

**Also changed:** `applyFlagSettings()` now live-applies agent changes · Spawn failure messages suggest `pathToClaudeCodeExecutable` · Permission-denied messages carry typed reasons (`safetyCheck`, `asyncAgent`) · Remote Control workers send `worker_shutting_down` on exit · MCP server-level specs in `disallowedTools` now correctly remove all server tools
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use `getSessionMessages()` to retrieve historical conversation messages when analyzing completed sessions — provides full message history including type, uuid, session_id, content, and tool interactions, critical for session-analysis and archival workflows [source](./.skilld/issues/issue-14.md)

- Ensure `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk` are installed as peer dependencies to maintain proper TypeScript type resolution — without them, event types resolve to `any` instead of concrete types [source](./.skilld/releases/CHANGELOG.md#L243)

- Pass `toolAliases` mapping to redirect built-in tool names to custom MCP tools — allows SDK consumers to override tools (e.g., `{ Bash: 'mcp__workspace__bash' }`) without the model emitting unknown-tool errors [source](./.skilld/pkg/sdk.d.ts:L1278)

- Use `sessionStore` option to mirror session transcripts to external storage instead of relying only on local disk — enables session archival, analytics pipelines, and multi-instance deployments with `SessionStore`/`SessionKey`/`SessionStoreEntry` types [source](./.skilld/releases/CHANGELOG.md#L377)

- Check `agent_id` field in `can_use_tool` hook requests to distinguish background subagent calls from main-thread calls — background agents forward permissions to `canUseTool` instead of auto-denying [source](./.skilld/releases/v0.3.186.md)

- Use `prompt_id` field in hook input payloads for correlating hook events with OpenTelemetry prompt-level events — enables deterministic tracing across the control plane and allows matching hook timestamps to distributed traces [source](./.skilld/releases/v0.3.196.md)

- Call `Query.reinitialize()` to re-send the initialize control request and redeliver pending permission/dialog prompts after a transport gap — idempotent initialization makes recovery from network disruptions reliable [source](./.skilld/releases/v0.3.195.md)

- Extract native binaries with `extractFromBunfs()` when compiling with `bun build --compile` — `require.resolve` doesn't work inside compiled `$bunfs` virtual filesystem, so embed the platform binary as a file asset and extract it [source](./.skilld/pkg/README.md:L19)

- Set `background: true` on agent definitions for fire-and-forget background tasks — prevents the session from waiting for the agent to complete, allowing the main thread to proceed while the background agent runs independently [source](./.skilld/pkg/sdk.d.ts:L38)

- Use `createSdkMcpServer()` to define custom tools that run in the same process rather than spawning external servers — handles lifecycle automatically; if tools run longer than 60s, override `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` to prevent premature stream closure [source](./.skilld/issues/issue-197.md#L40)

- Call `resolveSettings()` to inspect effective merged settings without spawning the CLI — reads MDM (plist/HKLM/HKCU) for parity with CLI startup and returns provenance info showing which tier supplied each setting value [source](./.skilld/releases/CHANGELOG.md#L277)

- Prefer the `skills` option over passing `'Skill'` in `allowedTools` — the latter is deprecated and `skills: 'all' | string[]` provides cleaner, more explicit skill configuration [source](./.skilld/releases/CHANGELOG.md#L291)

- Implement a `canUseTool` callback for programmatic permission decisions instead of relying only on permission modes — enables SDK consumers to inspect tool name, input schema, and context before making fine-grained allow/deny/prompt decisions per tool [source](./.skilld/pkg/sdk.d.ts:L1278)

<!-- /skilld:best-practices -->
