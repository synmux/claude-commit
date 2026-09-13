---
name: anthropic-ai-claude-code-skilld
description: "Use Claude, Anthropic's AI assistant, right from your terminal. Claude can understand your codebase, edit files, run terminal commands, and handle entire workflows for you. ALWAYS use when writing code importing \"@anthropic-ai/claude-code\". Consult for debugging, best practices, or modifying @anthropic-ai/claude-code, anthropic-ai/claude-code, anthropic-ai claude-code, anthropic ai claude code, claude-code-2.1.88, claude code 2.1.88."
metadata:
  version: 2.1.263
  generated_by: cached
  generated_at: 2026-09-13
---

# Exhen/claude-code-2.1.88 `@anthropic-ai/claude-code@2.1.263`
**Tags:** stable: 2.1.236, latest: 2.1.270, next: 2.1.270

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-code` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-code` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes in @anthropic-ai/claude-code — prioritize recent major/minor releases.

- DEPRECATED: `team_name` parameter in Agent configuration — no longer used; the session has a single implicit team [source](./.skilld/pkg/sdk-tools.d.ts:L688)

- DEPRECATED: `mode` parameter in Agent configuration — no longer accepted; subagents inherit the parent session's permission mode from frontmatter [source](./.skilld/pkg/sdk-tools.d.ts:L692)

- DEPRECATED: `shell_id` parameter in TaskStopInput — replaced by `task_id` for stopping background tasks and agents [source](./.skilld/pkg/sdk-tools.d.ts:L886)

- DEPRECATED: `allowedPrompts` field in ExitPlanModeInput — no longer used [source](./.skilld/pkg/sdk-tools.d.ts:L748)

- NEW: `isolation` modes for agents — added "worktree" (isolates to temporary git worktree) and "remote" (cloud execution) [source](./.skilld/pkg/sdk-tools.d.ts:L696)

- NEW: `EnterWorktreeInput` and `ExitWorktreeInput` tools — full git worktree lifecycle management with optional name or path parameters [source](./.skilld/pkg/sdk-tools.d.ts:L3140:L3156)

- NEW: `run_in_background` parameter for agents — explicit control over whether spawned agents execute in background (default true) or block [source](./.skilld/pkg/sdk-tools.d.ts:L682)

- NEW: Workflow orchestration with `WorkflowInput` — multi-agent orchestration via `agent()`, `parallel()`, and `pipeline()` with metadata and resumeFromRunId support [source](./.skilld/pkg/sdk-tools.d.ts:L2766)

- NEW: `ScheduleWakeupInput` tool — dynamic loop wake-up scheduling with configurable delays (60–3600 seconds) and reasoning [source](./.skilld/pkg/sdk-tools.d.ts:L2823)

- NEW: `MonitorInput` tool — real-time event streaming with task notification support [source](./.skilld/pkg/sdk-tools.d.ts:L2868)

- NEW: MCP (Model Context Protocol) tool support — `ListMcpResourcesInput`, `ReadMcpResourceInput`, `ReadMcpResourceDirInput`, `RefreshMcpToolsInput` for dynamic MCP server integration [source](./.skilld/pkg/sdk-tools.d.ts:L22:L24)

- NEW: Remote agent execution — agents with `isolation: "remote"` dispatch to cloud infrastructure with async_launched/remote_launched status [source](./.skilld/pkg/sdk-tools.d.ts:L186:L188)

**Also changed:** `RemoteTriggerInput` cloud triggering · `CronCreateInput`/`CronDeleteInput`/`CronListInput` scheduled task management · `NotebookEditInput` Jupyter notebook cell editing · `ReportFindingsInput` code review findings with verdicts
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Write agent descriptions as 3-5 word noun phrases — a terse label that appears in the user's terminal, not a full requirement statement. Example: "Install dependencies" or "Review pull request" [source](./.skilld/pkg/sdk-tools.d.ts:L665)

- Leave agents to run in the background by default; set `run_in_background: false` only when the very next action depends on the result and nothing else can usefully happen while it runs — background execution lets the user queue other work [source](./.skilld/pkg/sdk-tools.d.ts:L671)

- Format Bash descriptions in active voice, starting with a verb for simple commands (5-10 words) or adding context for complex/piped commands to clarify what they do — avoid vague words like "complex" or "risk" [source](./.skilld/pkg/sdk-tools.d.ts:L702)

- Omit the optional `path` field in Glob and Grep to use the current working directory; never pass `undefined` or `null` explicitly — the tool interprets these differently than an omitted field [source](./.skilld/pkg/sdk-tools.d.ts:L817)

- Begin Workflow `meta` blocks with a pure literal `export const meta = { name, description, phases }` containing no computed values, function calls, or conditionals — the runtime validates this before script execution [source](./.skilld/pkg/sdk-tools.d.ts:L2770)

- Pass Workflow `args` as actual JSON values (objects and arrays), not JSON-encoded strings — a stringified list breaks `args.filter` and `args.map` when the script processes input [source](./.skilld/pkg/sdk-tools.d.ts:L2775)

- Use `scriptPath` to iterate on Workflow scripts: save the returned path after each invocation, edit the file with Write/Edit, then re-invoke Workflow with the same `scriptPath` instead of re-sending the full script [source](./.skilld/pkg/sdk-tools.d.ts:L2792)

- Publish Artifact files with short, distinctive basenames — this becomes the fallback title when the HTML lacks a `<title>` tag, and it serves as the visual identity in the gallery [source](./.skilld/pkg/sdk-tools.d.ts:L3063)

- Include `favicon` (one or two emoji) only on the first Artifact publish; omit it on redeploys to preserve the artifact's existing icon — pass a new one only when the user explicitly requests it [source](./.skilld/pkg/sdk-tools.d.ts:L3067)

- Always pass the `url` parameter when updating an existing Artifact the user owns — without it, the publish creates a separate artifact instead of updating in place [source](./.skilld/pkg/sdk-tools.d.ts:L3088)

- Never force-push past an Artifact conflict using `force: true` — always merge changes onto the newer content and republish instead; the only exception is when the user has explicitly stated they want to discard that specific version [source](./.skilld/pkg/sdk-tools.d.ts:L3099)

- Structure SendFeedback details with labeled bullets in order: **What happened:** (observed vs. expected, exact error if short); **What the user said:** (quoted); **Repro:** (minimal steps); **Evidence:** (request IDs, timestamps, versions); optionally **Cause:** (only if verified). Keep each to 1-3 lines, no narrative or speculation [source](./.skilld/pkg/sdk-tools.d.ts:L2608)

- Write ProposeGoal conditions as verifiable statements that a separate evaluator can check from the conversation (e.g. "all tests in test/auth pass (bun test exits 0)") — limit to 500 characters so users can read the full condition in the approval dialog [source](./.skilld/pkg/sdk-tools.d.ts:L3025)
<!-- /skilld:best-practices -->
