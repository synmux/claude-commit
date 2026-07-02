---
name: anthropic-ai-claude-agent-sdk-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-agent-sdk". Consult for debugging, best practices, or modifying @anthropic-ai/claude-agent-sdk, anthropic-ai/claude-agent-sdk, anthropic-ai claude-agent-sdk, anthropic ai claude agent sdk, claude-agent-sdk-typescript, claude agent sdk typescript.'
metadata:
  version: 0.3.198
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-01
---

# anthropics/claude-agent-sdk-typescript `@anthropic-ai/claude-agent-sdk@0.3.198`

**Tags:** latest: 0.3.198, next: 0.3.198

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-agent-sdk` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-agent-sdk` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes in the Claude Agent SDK v0.3.x series, prioritising recent minor/patch releases.

### New APIs and Methods

- NEW: `Query.reinitialize()` — v0.3.195 adds a method to re-send the initialize control request after a transport gap and redeliver pending permission/dialog prompts, enabling graceful recovery in long-lived SDK sessions [source](./.skilld/releases/v0.3.195.md:L11)

- NEW: `ReadMcpResourceDirTool` — v0.3.186 introduces a dedicated tool type for MCP resource directory listing; previously this was a fallback inside `ReadMcpResourceTool`, now it is a first-class tool that SDK consumers can control via `allowedTools` and `disallowedTools` [source](./.skilld/releases/v0.3.186.md:L12)

- NEW: `rewind_conversation` control request — v0.3.186 adds support for rewinding a conversation to a previous point with durable resume anchor support, enabling conversation branching workflows [source](./.skilld/releases/v0.3.186.md:L13)

- NEW: `tool_use_meta` sidecar on assistant messages — v0.3.179 adds optional display-friendly metadata for tool calls, with `icon_url` field added in v0.3.181 from MCP server directory metadata, allowing SDK consumers to render human-readable labels instead of raw wire names [source](./.skilld/releases/v0.3.179.md:L11) [source](./.skilld/releases/v0.3.181.md:L12)

- NEW: `old_source` field in `NotebookEdit` tool results — v0.3.191 adds this field for `replace` and `delete` operations, enabling inline diffs and better version tracking in SDK consumers [source](./.skilld/releases/v0.3.191.md:L11)

- NEW: `prompt_id` field in hook input payloads — v0.3.196 adds this UUID field to all hook inputs for correlating hook events with OpenTelemetry prompt-level events (same value as the `prompt.id` OTel attribute), enabling instrumentation and debugging of per-prompt event chains [source](./.skilld/releases/v0.3.196.md:L11)

### Breaking/Significant Changes

- BREAKING: `initialize` control request is now idempotent — v0.3.161 changed `initialize` to return success on subsequent calls with the same payload instead of erroring with "Already initialized". `ControlResponse` gains optional `pending_permission_requests` field to mirror error response format [source](./CHANGELOG.md:L168-169)

- BREAKING: MCP servers now connect in background by default — v0.2.142 changed startup to spawn MCP connections asynchronously; sessions start immediately and slow servers report `status: "pending"` until ready. Set `MCP_CONNECTION_NONBLOCKING=0` to block on connection completion or mark a server `alwaysLoad: true` to require readiness before first query [source](./CHANGELOG.md:L249)

- BREAKING: Switched from `TodoWrite` to Task tools — v0.2.142 migrated headless and SDK sessions to use `TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList` instead of `TodoWrite` (deprecated since v0.2.136). Tool consumers should accumulate task state by ID rather than replacing snapshot lists [source](./CHANGELOG.md:L250)

- BREAKING: Removed unstable v2 session API — v0.2.142 removed `unstable_v2_createSession`, `unstable_v2_resumeSession`, `unstable_v2_prompt`, and related types. Use `query()` with an `AsyncIterable<SDKUserMessage>` for multi-turn or `options.resume` to continue a session [source](./CHANGELOG.md:L248)

### Field Additions and Enhancements

- `SDKRateLimitInfo` gains three fields in v0.3.181 for detecting credits-required rate limits: `errorCode`, `canUserPurchaseCredits`, `hasChargeableSavedPaymentMethod`. Also gains `seven_day_overage_included` value in v0.3.191 for `rateLimitType` (per-model weekly usage limits) and `model_scoped` array to usage responses with per-model weekly limit windows, utilization, and reset times [source](./.skilld/releases/v0.3.181.md:L11-12) [source](./.skilld/releases/v0.3.191.md:L12-13)

- `system/model_fallback` message expanded in v0.3.174 — now emitted for all fallback triggers (`overloaded`, `server_error`, `last_resort`) in addition to the prior `model_not_found` and `permission_denied`. The `trigger` field gains `server_error` and `last_resort` enum values [source](./.skilld/releases/v0.3.174.md:L11)

- `agent_id` field added to `can_use_tool` control requests in v0.3.186 — background agents now forward permission prompts to `canUseTool` callbacks instead of auto-denying; stdin stays open during background tasks for interactive tool execution [source](./.skilld/releases/v0.3.186.md:L11)

### Configuration and Options

- NEW: `sandbox.credentials` settings — v0.3.187 adds SDK settings types for configuring credential file and environment variable denial in sandboxed commands, enabling fine-grained security policy control [source](./.skilld/releases/v0.3.187.md:L11)

- NEW: `skipMcpDiscovery` plugin option — v0.3.172 allows plugins to set `skipMcpDiscovery: true`, enabling SDK hosts to manage a plugin's MCP connections themselves and load skills/hooks without re-reading the plugin's `.mcp.json` file [source](./.skilld/releases/v0.3.172.md:L11)

- NEW: Model aliases and fable support — v0.3.170 adds `claude-fable-5` model and the `fable` alias to SDK model types, alongside existing aliases like `opus`, `sonnet`, `haiku` [source](./.skilld/releases/v0.3.170.md:L11)

**Also changed:** `applyFlagSettings()` now live-applies agent changes in v0.3.161 · `system/model_fallback` message expanded to include server errors in v0.3.174
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices for @anthropic-ai/claude-agent-sdk v0.3.198

## Best Practices

- Ensure `@anthropic-ai/sdk` is installed as a direct dependency alongside the agent SDK — the agent SDK re-exports types from `@anthropic-ai/sdk` internally, and missing it causes TypeScript to resolve types as `any` [source](./.skilld/issues/issue-121.md#missing-anthropicsdk-dependency-causes-types-to-resolve-as-any)

- Use `disallowedTools` rather than `allowedTools` for tool control — `allowedTools` is intended for permission gating (controlling which tools prompt users), not for specifying available tools; prefer `disallowedTools` to exclude specific tools [source](./.skilld/issues/issue-19.md#allowedtools-option-does-not-work)

- Set `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` environment variable when using MCP servers with long-running tools (>60s) — the default 60-second timeout closes the stream for all pending concurrent tool calls, not just the timed-out one; increase to 300000 (5 minutes) or higher [source](./.skilld/issues/issue-41.md#sdk-mcp-server-stream-closed-errors-during-concurrent-tool-calls:L97:102)

- Prefer stdio transport over SDK transport (createSdkMcpServer) for MCP servers handling concurrent tool calls — the SDK transport has race conditions during concurrent execution; switching to stdio transport eliminates "Stream closed" errors [source](./.skilld/issues/issue-41.md#sdk-mcp-server-stream-closed-errors-during-concurrent-tool-calls:L105:107)

- Call `query.reinitialize()` after detecting a transport disconnect to re-deliver pending permission requests and dialog prompts — without reinitialization, in-flight prompts are lost on reconnection [source](./.skilld/releases/v0.3.195.md#whats-changed)

```ts
const queryStream = query({...});
// Later, after transport gap detected:
queryStream.reinitialize();
```

- Extract platform-specific CLI binaries when using `bun build --compile` — the compiled bundle's virtual filesystem prevents `require.resolve` from locating the native binary; use `extractFromBunfs()` and pass the extracted path explicitly [source](./.skilld/pkg-claude-agent-sdk/README.md#compiled-binaries-bun-build---compile)

```ts
import binPath from "@anthropic-ai/claude-agent-sdk-darwin-arm64/claude" with { type: "file" };
import { extractFromBunfs } from "@anthropic-ai/claude-agent-sdk/extract";

const cliPath = extractFromBunfs(binPath);
const response = query({
  prompt: "…",
  options: { pathToClaudeCodeExecutable: cliPath },
});
```

- Implement OpenTelemetry instrumentation via SDK hooks for production observability — the SDK does not support the CLAUDE_CODE_ENABLE_TELEMETRY environment variable or automatic span generation; use session hooks to manually wire telemetry [source](./.skilld/issues/issue-82.md#observability-with-opentelemetry:L34:43)

- Monitor MCP tool timeout configurations carefully — setting `MCP_TOOL_TIMEOUT` does not guarantee timeout behavior because undici's `headersTimeout` (5 minutes) acts as an independent hard ceiling; configure both the MCP timeout and the undici timeout [source](./.skilld/issues/issue-118.md#mcp-tool-calls-timeout-at-5-minutes-due-to-undici-headerstimeout-despite-mcp_tool_timeout1200000-20-minutes)

- Be aware that `enableFileCheckpointing` does not work in SDK (non-interactive) mode — file snapshots are only created during interactive CLI execution; `rewindFiles()` will always return `canRewind: false` when using the SDK programmatically [source](./.skilld/issues/issue-236.md#file-checkpointing-snapshots-not-created-in-sdk-non-interactive-mode)

- Filter out `(no content)` placeholder text blocks in SDK versions before v0.2.30 — earlier versions emit spurious text content blocks with literal "(no content)" before thinking blocks; upgrade to v0.2.30+ or filter in streaming handlers [source](./.skilld/issues/issue-153.md#bug-no-content-text-blocks-are-emitted-before-thinking-blocks:L83:86)

- Understand prompt cache invalidation triggers to optimize costs — random UUIDs in tool descriptions can invalidate the entire cache prefix between `query()` calls, wasting cache benefits (2x input cost for `ephemeral_1h` writes); document cache-sensitive system prompt content and avoid dynamic values [source](./.skilld/issues/issue-197.md#problem)

- Store `ANTHROPIC_API_KEY` outside the agent execution context to prevent credential leakage — agents with access to environment variables can extract API keys; use separate credential injection patterns or isolation mechanisms for production deployments [source](./.skilld/issues/issue-37.md#risk-of-exposing-anthropic_api_key)

- Verify async subagent spawning is supported in your target version — v0.1.77 and later versions had regressions where async subagent prompts failed with "only prompt commands are supported in streaming mode" error; check release notes for your version [source](./.skilld/issues/issue-130.md#async-subagents-error-with-only-prompt-commands-are-supported-in-streaming-mode)

<!-- /skilld:best-practices -->
