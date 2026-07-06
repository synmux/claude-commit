---
name: anthropic-ai-claude-code-skilld
description: 'Use Claude, Anthropic''s AI assistant, right from your terminal. Claude can understand your codebase, edit files, run terminal commands, and handle entire workflows for you. ALWAYS use when writing code importing "@anthropic-ai/claude-code". Consult for debugging, best practices, or modifying @anthropic-ai/claude-code, anthropic-ai/claude-code, anthropic-ai claude-code, anthropic ai claude code, claude-code-2.1.88, claude code 2.1.88.'
metadata:
  version: 2.1.201
  generated_by: cached
  generated_at: 2026-07-06
---

# Exhen/claude-code-2.1.88 `@anthropic-ai/claude-code@2.1.201`

**Tags:** stable: 2.1.193, latest: 2.1.201, next: 2.1.201

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-code` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-code` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes in @anthropic-ai/claude-code v2.1.201 — prioritize these when using the CLI or SDK.

- NEW: `ClaudeDesignInput` and `ClaudeDesignOutput` tools — perform Claude Design operations (generate, manage, sync designs); call with `operation: "list"` first to discover available actions [source](./.skilld/pkg/sdk-tools.d.ts:L2341-2352)

- BREAKING: `ProjectsInput` — parameter `force` renamed to `present_to_user` with inverted semantics: old `force` bypassed budget guards; new `present_to_user` marks the doc as the deliverable the user asked for [source](./.skilld/pkg/sdk-tools.d.ts:L2365-2368)

- BREAKING: `ProjectsOutput` (project_write) — `knowledge` object removed entirely, replaced with `present_to_user?: boolean` flag; code reading `knowledge_size`, `max_knowledge_size`, `search_threshold`, `rag_active`, or `remaining_budget` will crash [source](./.skilld/pkg/sdk-tools.d.ts:L2398-2402)

- BREAKING: `ProjectsOutput` (project_info) — `knowledge.search_threshold`, `knowledge.rag_active`, and `knowledge.remaining_budget` fields removed; only `knowledge_size` and `max_knowledge_size` remain [source](./.skilld/pkg/sdk-tools.d.ts:L2370-2373)

- NEW: `FileReadOutput` — added `source?: "seeded"` field to distinguish dedup matches from startup context (CLAUDE.md / nested memory) vs. prior tool results [source](./.skilld/pkg/sdk-tools.d.ts:L309-312)

- NEW: `ReportFindingsInput` — findings array items now accept `category?: string` (kebab-case slug like `"correctness"`, `"simplification"`, `"efficiency"`, `"test-coverage"`); enables fine-grained finding classification for code review workflows [source](./.skilld/pkg/sdk-tools.d.ts:L716-719)

- REMOVED: `PushNotificationOutput` — `idleSec?: number` and `hasFocus?: boolean` fields no longer present; use `sentAt` timestamp and `disabledReason` enum for notification state tracking [source](./.skilld/pkg/sdk-tools.d.ts:L3504-3509)

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices — @anthropic-ai/claude-code@2.1.201

- Define workflow `meta` as a pure literal object with no computed values or function calls — the schema enforces immutability; computed values cause parse failures and make resume semantics ambiguous [source](./.skilld/pkg/sdk-tools.d.ts:L2462:2493)

- Prefer `pipeline()` over `parallel()` in workflows when stages are logically sequential — it provides wall-clock speed (slowest single-item chain) without barrier latency while still running all items concurrently through the stages [source](./.skilld/pkg/sdk-tools.d.ts:L2462:2493)

- Set `persistent: true` on Monitor when watching session-length state (PR monitoring, log tails) — `persistent` ignores the `timeout_ms` default of 300s and runs until TaskStop or session end [source](./.skilld/pkg/sdk-tools.d.ts:L2547:2571)

- Use `ScheduleWakeup` with `delaySeconds` between 300–3600 (5–60 min) for idle polling loops rather than `sleep` commands — avoids blocking, respects prompt cache TTL, and keeps sessions responsive [source](./.skilld/pkg/sdk-tools.d.ts:L2519:2532)

- Spawn worktree-isolated agents for concurrent mutations using `isolation: "worktree"` — prevents file-lock collisions and allows parallel edits across a codebase without shared state hazards [source](./.skilld/pkg/sdk-tools.d.ts:L410:447)

- Pass `run_in_background: false` to Agent when you need its result before continuing — the default background mode is asynchronous; synchronous agents block until completion but return structured output immediately [source](./.skilld/pkg/sdk-tools.d.ts:L410:447)

- Use `CronCreate` with `durable: true` only when the user explicitly requests the task survive session restarts — the default `durable: false` is in-memory only and auto-deletes with the session [source](./.skilld/pkg/sdk-tools.d.ts:L2494:2511)

- Check `agent()` return value is non-null before using it in workflows — agents fail silently on terminal API errors, returning `null` instead of throwing; filter with `.filter(Boolean)` before downstream work [source](./.skilld/pkg/sdk-tools.d.ts:L410:447)

- Set effort levels on expensive verification phases — `effort: "high"` or `"xhigh"` on agents verifying code correctness or security ensures deeper reasoning; low effort is appropriate only for cheap mechanical stages [source](./.skilld/pkg/sdk-tools.d.ts:L410:447)

- Override agent model for specific task tiers — use `model: "haiku"` for mechanical stages (pagination, filtering, boilerplate) and `model: "opus"` for novel design/reasoning phases to optimize cost and latency [source](./.skilld/pkg/sdk-tools.d.ts:L410:447)

- Batch file reads using `limit` and `offset` parameters for large files — reading partial chunks avoids token overrun; many small reads in parallel are cheaper than one full read that truncates [source](./.skilld/pkg/sdk-tools.d.ts:L528:545)

- Set tool timeouts conservatively: Bash max 600s, Monitor max 3600s — long operations that timeout silently drop output; estimate wall-clock time and add buffer for network latency [source](./.skilld/pkg/sdk-tools.d.ts:L2547:2571)

- Resume workflows from runId after edits to cache unchanged agent() calls — the longest unchanged prefix of agent() calls returns cached results instantly; only edited/new calls re-run, preserving prior work [source](./.skilld/pkg/sdk-tools.d.ts:L2462:2493)

<!-- /skilld:best-practices -->
