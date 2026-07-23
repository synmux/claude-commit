---
name: anthropic-ai-claude-code-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-code". Consult for debugging, best practices, or modifying @anthropic-ai/claude-code, anthropic-ai/claude-code, anthropic-ai claude-code, anthropic ai claude code, claude-code-2.1.88, claude code 2.1.88.'
metadata:
  version: 2.1.218
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-23
---

# Exhen/claude-code-2.1.88 `@anthropic-ai/claude-code@2.1.218`

**Tags:** stable: 2.1.206, latest: 2.1.218, next: 2.1.218

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-code` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-code` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes in @anthropic-ai/claude-code v2.1.x.

- DEPRECATED: `team_name` in AgentInput — ignored since session has a single implicit team [source](./.skilld/pkg/sdk-tools.d.ts:L510)

- DEPRECATED: `mode` in AgentInput — subagents now inherit from parent session; agent-definition frontmatter may override [source](./.skilld/pkg/sdk-tools.d.ts:L514)

- DEPRECATED: `allowedPrompts` in ExitPlanModeInput — no longer used [source](./.skilld/pkg/sdk-tools.d.ts:L570)

- DEPRECATED: `shell_id` in TaskStopInput — use `task_id` instead [source](./.skilld/pkg/sdk-tools.d.ts:L708)

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Spawn agents with background execution by default — set `run_in_background: false` only when you need the result before continuing [source](./.skilld/pkg/sdk-tools.d.ts:L502-504)

- Use agent isolation modes for conflict-free parallel work — "worktree" creates an isolated git working copy; "remote" runs in a cloud environment for true isolation [source](./.skilld/pkg/sdk-tools.d.ts:L518-520)

- Resume workflows by runId to skip re-running unchanged agent calls — completed agent() calls with identical prompt and options return cached results instantly; only edited or new calls re-execute [source](./.skilld/pkg/sdk-tools.d.ts:L2564-2595)

- Write bash descriptions that are clear and concise in active voice — keep brief descriptions under 10 words (e.g. "List files in current directory"); only add context for complex piped commands or uncommon flags [source](./.skilld/pkg/sdk-tools.d.ts:L532-543)

- Use REPL for stateful JavaScript execution with top-level await support — state persists across calls within the same session, enabling iterative multi-step computations [source](./.skilld/pkg/sdk-tools.d.ts:L2550-2563)

- Set `persistent: true` on Monitor for session-length watches — use for monitoring PR reviews, log tails, or other tasks that run for the lifetime of the session; otherwise specify a timeout [source](./.skilld/pkg/sdk-tools.d.ts:L2653-2730)

- Merge and re-publish artifacts on concurrent writes instead of using force — read the current version, merge your edits on top, and publish again; force: true should only be used when the user explicitly requests replacement [source](./.skilld/pkg/sdk-tools.d.ts:L2829-2870)

- Use `durable: true` in CronCreate only when tasks must survive session restarts — by default, cron jobs are in-memory and die when the session ends; persist only what needs to [source](./.skilld/pkg/sdk-tools.d.ts:L2620-2640)

- Pick ScheduleWakeup delays matching the external state you're watching — the delay is clamped to [60, 3600] seconds; use short intervals for fast-changing state (CI runs), longer for slow changes [source](./.skilld/pkg/sdk-tools.d.ts:L2621-2638)

- Choose Grep output_mode based on your downstream use — "content" for line-by-line inspection, "files_with_matches" for path discovery, "count" for statistics; context options only work in "content" mode [source](./.skilld/pkg/sdk-tools.d.ts:L640-701)

- Keep push notification messages under 200 characters — mobile operating systems truncate longer messages, so prioritise conciseness [source](./.skilld/pkg/sdk-tools.d.ts:L2871-2887)

- Prefer HTML <title> tags over the artifact title parameter — the tag always takes precedence and never gets overridden; the parameter fills in only when the file lacks one [source](./.skilld/pkg/sdk-tools.d.ts:L2829-2870)

- Structure AskUserQuestion with 1–4 questions and 2–4 mutually exclusive options per question — the framework automatically adds "Other" to every set, so design for distinct, non-overlapping choices [source](./.skilld/pkg/sdk-tools.d.ts:L848-920)

<!-- /skilld:best-practices -->
