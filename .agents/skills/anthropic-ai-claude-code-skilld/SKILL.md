---
name: anthropic-ai-claude-code-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-code". Consult for debugging, best practices, or modifying @anthropic-ai/claude-code, anthropic-ai/claude-code, anthropic-ai claude-code, anthropic ai claude code, claude-code-2.1.88, claude code 2.1.88.'
metadata:
  version: 2.1.198
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-01
---

# Exhen/claude-code-2.1.88 `@anthropic-ai/claude-code@2.1.198`

**Tags:** stable: 2.1.187, next: 2.1.198, latest: 2.1.198

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-code` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-code` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes in @anthropic-ai/claude-code v2.1.198 — prioritize these when using the CLI or SDK.

- DEPRECATED: `team_name` parameter in `AgentInput` — ignored as sessions now have a single implicit team [source](./.skilld/pkg/sdk-tools.d.ts:L439)

- DEPRECATED: `shell_id` parameter in `TaskStopInput` — use `task_id` instead [source](./.skilld/pkg/sdk-tools.d.ts:L637)

- NEW: `Workflow` tool — orchestrate multi-agent workflows with `agent()`, `parallel()`, `pipeline()`, and `phase()` primitives; supports resumable runs and budget tracking [source](./.skilld/pkg/sdk-tools.d.ts:L2449-2480)

- NEW: `EnterWorktree` and `ExitWorktree` tools — manage isolated git worktrees for parallel development or risky changes; support named or existing worktree paths [source](./.skilld/pkg/sdk-tools.d.ts:L2592-2611)

- NEW: `CronCreate`, `CronDelete`, and `CronList` tools — schedule durable or in-memory cron jobs; supports standard 5-field cron expressions and one-shot scheduling [source](./.skilld/pkg/sdk-tools.d.ts:L2481-2505)

- NEW: `ScheduleWakeup` tool — schedule a single wake-up after a delay (60–3600 seconds); fires the given `/loop` command at the specified time [source](./.skilld/pkg/sdk-tools.d.ts:L2506-2518)

- NEW: `Monitor` tool — watch a shell command or WebSocket stream for events; emits each stdout line or socket frame as an event [source](./.skilld/pkg/sdk-tools.d.ts:L2534-2557)

- NEW: `RemoteTrigger` tool — manage remote trigger actions (list, get, create, update, run) for external integrations [source](./.skilld/pkg/sdk-tools.d.ts:L2520-2532)

- NEW: Task management suite (`TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList`) — create and manage in-session task lists with status tracking, blocking relationships, and metadata [source](./.skilld/pkg/sdk-tools.d.ts:L2369-2435)

- NEW: `REPL` tool — execute arbitrary JavaScript with top-level await support and persistent state across calls [source](./.skilld/pkg/sdk-tools.d.ts:L2436-2448)

**Also changed:** `Artifact` tool now accepts `favicon`, `label`, `url`, and `force` parameters for managing live artifact versions · `PushNotification` tool for sending mobile and browser notifications
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices — @anthropic-ai/claude-code@2.1.198

## Best Practices

- Define workflow `meta` as a pure literal object with no computed values or function calls — the schema enforces immutability; computed values cause parse failures and make resume semantics ambiguous [source](./.skilld/pkg/sdk-tools.d.ts:L2449:2480)

- Prefer `pipeline()` over `parallel()` in workflows when stages are logically sequential — it provides wall-clock speed (slowest single-item chain) without barrier latency while still running all items concurrently through the stages [source](./.skilld/pkg/sdk-tools.d.ts:L2449:2480)

- Set `persistent: true` on Monitor when watching session-length state (PR monitoring, log tails) — `persistent` ignores the `timeout_ms` default of 300s and runs until TaskStop or session end [source](./.skilld/pkg/sdk-tools.d.ts:L2534:2558)

- Use `ScheduleWakeup` with `delaySeconds` between 300–3600 (5–60 min) for idle polling loops rather than `sleep` commands — avoids blocking, respects prompt cache TTL, and keeps sessions responsive [source](./.skilld/pkg/sdk-tools.d.ts:L2506:2533)

- Spawn worktree-isolated agents for concurrent mutations using `isolation: "worktree"` — prevents file-lock collisions and allows parallel edits across a codebase without shared state hazards [source](./.skilld/pkg/sdk-tools.d.ts:L413:450)

- Pass `run_in_background: false` to Agent when you need its result before continuing — the default background mode is asynchronous; synchronous agents block until completion but return structured output immediately [source](./.skilld/pkg/sdk-tools.d.ts:L413:450)

- Use `CronCreate` with `durable: true` only when the user explicitly requests the task survive session restarts — the default `durable: false` is in-memory only and auto-deletes with the session [source](./.skilld/pkg/sdk-tools.d.ts:L2481:2505)

- Check `agent()` return value is non-null before using it in workflows — agents fail silently on terminal API errors, returning `null` instead of throwing; filter with `.filter(Boolean)` before downstream work [source](./.skilld/pkg/sdk-tools.d.ts:L91:179)

- Set effort levels on expensive verification phases — `effort: "high"` or `"xhigh"` on agents verifying code correctness or security ensures deeper reasoning; low effort is appropriate only for cheap mechanical stages [source](./.skilld/pkg/sdk-tools.d.ts:L2476:2480)

- Override agent model for specific task tiers — use `model: "haiku"` for mechanical stages (pagination, filtering, boilerplate) and `model: "opus"` for novel design/reasoning phases to optimize cost and latency [source](./.skilld/pkg/sdk-tools.d.ts:L413:450)

- Batch file reads using `limit` and `offset` parameters for large files — reading partial chunks avoids token overrun; many small reads in parallel are cheaper than one full read that truncates [source](./.skilld/pkg/sdk-tools.d.ts:L531:548)

- Set tool timeouts conservatively: Bash max 600s, Monitor max 3600s, REP max 600s — long operations that timeout silently drop output; estimate wall-clock time and add buffer for network latency [source](./.skilld/pkg/sdk-tools.d.ts:L451:482)

- Resume workflows from runId after edits to cache unchanged agent() calls — the longest unchanged prefix of agent() calls returns cached results instantly; only edited/new calls re-run, preserving prior work [source](./.skilld/pkg/sdk-tools.d.ts:L2449:2480)

- Use `args` to parameterize workflows instead of side-channel files — pass arrays/objects as native JSON (not stringified), and they become the global `args` variable in the script [source](./.skilld/pkg/sdk-tools.d.ts:L2449:2480)

<!-- /skilld:best-practices -->
