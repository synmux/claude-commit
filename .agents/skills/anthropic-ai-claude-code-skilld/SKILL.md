---
name: anthropic-ai-claude-code-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-code". Consult for debugging, best practices, or modifying @anthropic-ai/claude-code, anthropic-ai/claude-code, anthropic-ai claude-code, anthropic ai claude code, claude-code-2.1.88, claude code 2.1.88.'
metadata:
  version: 2.1.197
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-01
---

# Exhen/claude-code-2.1.88 `@anthropic-ai/claude-code@2.1.197`

**Tags:** stable: 2.1.185, next: 2.1.198, latest: 2.1.197

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-code` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-code` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes in @anthropic-ai/claude-code v2.1.197 — prioritize recent major/minor releases.

- DEPRECATED: `team_name` in AgentInput — deprecated and ignored; the session has a single implicit team [source](./.skilld/pkg/sdk-tools.d.ts:L439-441)

- DEPRECATED: `shell_id` in TaskStopInput — use `task_id` instead [source](./.skilld/pkg/sdk-tools.d.ts:L637-639)

- DEPRECATED: `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE` environment variable — will be removed on 06/01; switch to `/model claude-opus-4-6[1m]` then `/fast on` source

- NEW: Dynamic workflows — Claude now creates and orchestrates workflows across tens to hundreds of agents in the background; access via `/workflows` source

- NEW: `claude agents --json` — list live Claude sessions as JSON for scripting (tmux-resurrect, status bars, session pickers); includes fields `id`, `state`, `waitingFor` source

- NEW: `claude agents --bg --exec '<command>'` — run a shell command as a background session you can attach to and detach from source

- NEW: `/cd` command — move a session to a new working directory without breaking the prompt cache mid-session source

- NEW: `CLAUDE_CODE_SESSION_ID` environment variable — stdio MCP server subprocesses now receive this variable for session identification source

- NEW: `--safe-mode` flag and `CLAUDE_CODE_SAFE_MODE` environment variable — start Claude Code with all customizations (CLAUDE.md, plugins, skills, hooks, MCP servers) disabled for troubleshooting source

- NEW: `/simplify` command — runs cleanup-only review (reuse, simplification, efficiency, altitude) and applies the fixes, instead of the full bug-hunting review source

- CHANGED: `/model` behavior — now changes model only for the current session; press `d` in the picker to set default for new sessions source

- NEW: `/usage-credits` command — renamed from `/extra-usage`; old name still works as alias source

- NEW: LSP tool — Language Server Protocol support for code intelligence features like go-to-definition, find references, and hover documentation source

**Also changed:** `--tools` explicit Grep/Glob now active on native builds (v2.1.162) · `--resume` support for background sessions launched via `claude --bg` (v2.1.144) · Deprecated npm installations with recommendation to use `claude install` (v2.1.15) · Model auto-updates with "deprecated" warning notification (v2.1.183) · `disableBundledSkills` setting and `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` env var to hide bundled skills (v2.1.169) · `autoMode.classifyAllShell` setting to route all Bash/PowerShell through auto-mode classifier (v2.1.193)
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use absolute paths for all file operations — relative paths are not supported and will fail. Pass absolute file paths to FileWrite, FileEdit, FileRead, NotebookEdit, and Glob inputs [source](./.skilld/pkg/sdk-tools.d.ts:L549:568)

- Keep PushNotification messages under 200 characters — mobile operating systems truncate longer messages, and the full content may not be visible to users [source](./.skilld/pkg/sdk-tools.d.ts:L2585:2601)

- Use short, distinctive basenames for Artifact file paths — the basename becomes the fallback title if the HTML/Markdown file has no title tag, so choose names that will be readable in the artifact gallery [source](./.skilld/pkg/sdk-tools.d.ts:L2559:2584)

- Limit AskUserQuestion choices to 2-4 distinct, mutually exclusive options — do not include an 'Other' option, as it is automatically provided by the interface [source](./.skilld/pkg/sdk-tools.d.ts:L763:2339)

- Check the `truncated` field in GlobOutput — results are capped at 100 files. If truncation occurs, refine your glob pattern or search iteratively to discover all matching files [source](./.skilld/pkg/sdk-tools.d.ts:L2823:2848)

- Override the model parameter in AgentInput for tasks with specific computational needs — omit the parameter to inherit from the agent definition or parent, but set explicitly to "sonnet", "opus", "haiku", or "fable" when task requirements differ from the default [source](./.skilld/pkg/sdk-tools.d.ts:L413:450)

- Use the `isolation: "worktree"` option when spawning parallel agents working on the same repository — each agent gets a temporary copy, preventing file conflicts and interference [source](./.skilld/pkg/sdk-tools.d.ts:L413:450)

- Set appropriate effort levels for ReportFindings operations — use "low" for quick checks, "high" or "xhigh" for thorough reviews, and "max" only when exhaustive analysis is critical (higher levels require more tokens and time) [source](./.skilld/pkg/sdk-tools.d.ts:L692:728)

- Monitor cache token metrics in AgentOutput — check `cache_creation_input_tokens` and `cache_read_input_tokens` to understand which portions of your context are being cached, then optimize by structuring stable context to maximize cache hits on repeated calls [source](./.skilld/pkg/sdk-tools.d.ts:L91:179)

- Resume Workflow execution from saved run IDs to avoid recomputing unchanged agent() calls — unchanged (prompt, opts) pairs return cached results instantly; only modified or new calls re-run (same-session only) [source](./.skilld/pkg/sdk-tools.d.ts:L2449:2480)

- Use FileRead's `limit` parameter for large files and the `pages` parameter for PDFs (max 20 pages per request) — this prevents excessive token usage and maintains context efficiency [source](./.skilld/pkg/sdk-tools.d.ts:L513:548)

- Employ the correct ScheduleWakeup `delaySeconds` clamping strategy — the runtime clamps values to [60, 3600], so pick intervals based on what you're waiting for: stay under 270s for tasks that need rapid polling within a cache window, or use 1200-1800s for background checks that can tolerate a cache miss [source](./.skilld/pkg/sdk-tools.d.ts:L2506:2533)

<!-- /skilld:best-practices -->
