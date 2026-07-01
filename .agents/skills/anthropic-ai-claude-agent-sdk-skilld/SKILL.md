---
name: anthropic-ai-claude-agent-sdk-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-agent-sdk". Consult for debugging, best practices, or modifying @anthropic-ai/claude-agent-sdk, anthropic-ai/claude-agent-sdk, anthropic-ai claude-agent-sdk, anthropic ai claude agent sdk, claude-agent-sdk-typescript, claude agent sdk typescript.'
metadata:
  version: 0.3.197
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-01
---

# anthropics/claude-agent-sdk-typescript `@anthropic-ai/claude-agent-sdk@0.3.197`

**Tags:** next: 0.3.198, latest: 0.3.197

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-agent-sdk` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-agent-sdk` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- NEW: `Query.reinitialize()` — v0.3.195 added method to re-send the initialize control request and redeliver pending permission/dialog prompts after a transport gap, enabling robust session recovery without creating a new Query instance [source](./.skilld/releases/v0.3.195.md)

- NEW: `prompt_id` field in hook input payloads — v0.3.196 added UUID field to `BaseHookInput` for correlating hook events with OpenTelemetry prompt-level events using the same `prompt.id` attribute, enabling join-able audit trails [source](./.skilld/releases/v0.3.196.md)

- NEW: `agent_id` field in `can_use_tool` control requests — v0.3.186 added agent identifier to permission requests so background agents forward permission prompts to `canUseTool` instead of auto-denying, and stdin stays open during background tasks [source](./.skilld/releases/v0.3.186.md)

- NEW: `ReadMcpResourceDirTool` tool type — v0.3.186 added dedicated tool type for MCP resource directory listing, separating it from the fallback inside `ReadMcpResourceTool` for cleaner API surface [source](./.skilld/releases/v0.3.186.md)

- NEW: `rewind_conversation` control request — v0.3.186 added capability to rewind a conversation to a previous point with durable resume anchor support, enabling session recovery and branching workflows [source](./.skilld/releases/v0.3.186.md)

- NEW: `tool_use_meta` sidecar on assistant messages — v0.3.179 added optional metadata object with display-friendly names for tool calls, so SDK consumers can render human-readable labels instead of raw wire names [source](./.skilld/releases/v0.3.179.md)

- NEW: `old_source` field in `NotebookEdit` tool results — v0.3.191 added field to `replace` and `delete` operations for retrieving original cell content, enabling inline diffs and cell history visualization [source](./.skilld/releases/v0.3.191.md)

- NEW: `errorCode`, `canUserPurchaseCredits`, `hasChargeableSavedPaymentMethod` fields to `SDKRateLimitInfo` — v0.3.181 added fields for detecting credits-required rate limits and enabling purchase flow UI [source](./.skilld/releases/v0.3.181.md)

- NEW: `seven_day_overage_included` rate limit type — v0.3.191 added to `SDKRateLimitInfo.rateLimitType` for per-model weekly usage limits, complementing existing `five_hour` and `seven_day` types [source](./.skilld/releases/v0.3.191.md)

- NEW: `model_scoped` array in usage response — v0.3.191 added per-model weekly limit windows with utilization and reset times to enable model-specific billing and quota display [source](./.skilld/releases/v0.3.191.md)

- NEW: `promptSuggestions` option to Browser SDK `query()` — v0.3.193 added boolean option to opt the remote CLI into emitting follow-up suggestions after each turn [source](./.skilld/releases/v0.3.193.md)

- BREAKING: `system/model_fallback` message expansion — v0.3.174 expanded fallback triggers to emit for `overloaded`, `server_error`, and `last_resort` in addition to `model_not_found` and `permission_denied`, and `trigger` field gained `server_error` and `last_resort` values [source](./.skilld/releases/v0.3.174.md)

- NEW: `skipMcpDiscovery` option in SDK `plugins` — v0.3.172 added per-plugin option allowing hosts to manage plugin MCP connections and load skills/hooks without re-reading `.mcp.json` [source](./.skilld/releases/v0.3.172.md)

- NEW: `claude-fable-5` model and `fable` alias — v0.3.170 added new model to SDK model type union and model aliases, enabling use of Anthropic's new Fable 5 family [source](./.skilld/releases/v0.3.170.md)

- NEW: `sandbox.credentials` setting — v0.3.187 added to SDK settings types for controlling credential file and environment variable denial in sandboxed commands [source](./.skilld/releases/v0.3.187.md)

**Also changed:** `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` new experimental Query method for structured session cost/rate-limit/usage data (experimental) · `tool_use_meta.icon_url` new field populated from MCP server directory metadata · `denial reasons` in permission-denied messages now typed (`safetyCheck`, `asyncAgent`) for programmatic matching · `commands_changed` event fix for synced skills · MCP server-level specs in `disallowedTools` now correctly enforce removal · `worker_shutting_down` system message on Remote Control graceful exit
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use `getSessionMessages()` to retrieve historical conversation data when resuming or analysing sessions — enables building session management dashboards, exporters, and analytics tools [source](./.skilld/issues/issue-14.md#top-comments)

- Call `Query.reinitialize()` after a transport gap to resend the initialize control request and redeliver pending permission/dialog prompts — recovers state without full reconnection [source](./.skilld/releases/v0.3.195.md#whats-changed)

- Wrap long-running MCP server tools with `createSdkMcpServer` and override `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` env var when calls will exceed 60s — default timeout causes false "Stream closed" errors [source](./.skilld/pkg/sdk.d.ts:L441)

- Use `sandbox.credentials` config to explicitly deny credential file and environment variable access in sandboxed commands — prevents accidental credential exposure from agent prompts [source](./.skilld/releases/v0.3.187.md#whats-changed)

- Access `tool_use_meta` sidecar on assistant messages to render human-readable tool names instead of wire names — improves UX and debugging visibility [source](./.skilld/releases/v0.3.179.md#whats-changed)

- When libc mismatch occurs (musl binary on glibc host or vice versa), pass `options.pathToClaudeCodeExecutable` to specify the correct binary — SDK will explain the error and suggest this fix [source](./.skilld/releases/v0.3.178.md#whats-changed)

- Use MCP server-level specs in `disallowedTools` array (e.g., `mcp__server_name` or `mcp__server_name__*`) to remove all tools from a server at once — bypasses need for individual tool listings [source](./.skilld/releases/v0.3.178.md#whats-changed)

- Understand that `allowedTools` controls permissioning (what the agent is _allowed_ to use), not which tools are _available_ — use future `baseTools` config (when available) to control tool availability instead [source](./.skilld/issues/issue-19.md#top-comments)

- Account for directory traversal when using SDK in monorepos — SDK searches up from `cwd` to find CLAUDE.md files, potentially loading parent project configurations [source](./.skilld/issues/issue-149.md#problem-statement)

- When resuming a session, verify that background agent state, remote agent state, and MCP task state are properly restored — previous versions dropped this state silently [source](./.skilld/releases/v0.3.176.md#whats-changed)

- Use `prompt_id` field in hook input payloads to correlate hook events with OpenTelemetry span events — enables observability tracing across multiple telemetry systems [source](./.skilld/releases/v0.3.196.md#whats-changed)

- Handle `system/model_fallback` messages to detect when the model falls back due to overload, server error, or insufficient credits — check `trigger` field for `overloaded`, `server_error`, `last_resort`, `model_not_found`, or `permission_denied` [source](./.skilld/releases/v0.3.174.md#whats-changed)

- Set `skipMcpDiscovery: true` in plugin config when your host manages the plugin's MCP connections externally — prevents the SDK from redundantly re-reading `.mcp.json` files [source](./.skilld/releases/v0.3.172.md#whats-changed)

<!-- /skilld:best-practices -->
