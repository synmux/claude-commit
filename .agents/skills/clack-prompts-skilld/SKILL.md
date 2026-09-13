---
name: clack-prompts-skilld
description: "ALWAYS use when writing code importing \"@clack/prompts\". Consult for debugging, best practices, or modifying @clack/prompts, clack/prompts, clack prompts, clack."
metadata:
  version: 1.7.0
  generated_by: cached
  generated_at: 2026-09-13
---

# bombshell-dev/clack `@clack/prompts@1.7.0`
**Tags:** alpha: 1.0.0-alpha.10, latest: 1.8.1

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @clack/prompts` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @clack/prompts` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes for @clack/prompts v1.7.0 and recent releases — focus on major/minor versions containing breaking changes or new APIs that training data may not cover.

### Breaking Changes

- BREAKING: ESM-only distribution since v1.0.0 — package no longer dual-publishes CJS. CJS projects on Node v20+ must use `require()` with ESM loader [source](./.skilld/releases/@clack/prompts@1.0.0.md:L11)

- BREAKING: `spinner.stop(undefined, code)` removed in v1.0.0 — use `spinner.stop()`, `spinner.cancel()`, or `spinner.error()` instead. Old code passing numeric codes (e.g. `1` for cancel, `2` for error) will fail silently [source](./.skilld/releases/@clack/prompts@1.0.0.md:L65)

- BREAKING: `suggestion` prompt removed in v1.0.0 — use `autocomplete` or `path` prompts instead [source](./.skilld/releases/@clack/prompts@1.0.0.md:L93)

- BREAKING: `path` prompt changed to autocomplete-based in v1.0.0 — behaviour differs from v0; now supports inline filtering [source](./.skilld/releases/@clack/prompts@1.0.0.md:L93)

- BREAKING: `note()` default formatter changed in v1.6.0 — lines no longer dim by default. To restore v1.5 behaviour, pass `format: (text) => styleText('dim', text)` option [source](./.skilld/releases/@clack/prompts@1.6.0.md:L11)

- BREAKING: Dependency externalization in v1.2.0 — `fast-string-width` and `fast-wrap-ansi` moved to peer dependencies to avoid duplicates [source](./.skilld/releases/@clack/prompts@1.2.0.md:L11)

- BREAKING: `picocolors` replaced with Node.js built-in `styleText` in v1.1.0 — code relying on direct picocolors imports will break [source](./.skilld/releases/@clack/prompts@1.1.0.md:L11)

### New APIs

- NEW: `multiline()` prompt (v1.3.0) — for multi-line text input, complements `text()` for single-line [source](./.skilld/releases/@clack/prompts@1.3.0.md:L12)

- NEW: `date()` prompt (v1.2.0) — renders date picker with format options: `'YMD' | 'MDY' | 'DMY'` [source](./.skilld/releases/@clack/prompts@1.2.0.md:L12)

- NEW: `box()` prompt (v1.0.0) — renders boxed text output, similar to `note()` but with box styling [source](./.skilld/releases/@clack/prompts@1.0.0.md:L95)

- NEW: `progress()` prompt (v1.0.0) — displays a progress bar for long-running tasks [source](./.skilld/releases/@clack/prompts@1.0.0.md:L97)

- NEW: `taskLog()` prompt (v1.0.0) — renders task output that clears on success, supports grouped logs with scrolling [source](./.skilld/releases/@clack/prompts@1.0.0.md:L27)

- NEW: `spinner.clear()` method (v1.0.0) — stops spinner and clears output [source](./.skilld/releases/@clack/prompts@1.0.0.md:L131)

- NEW: Signal support for abort (v1.0.0) — all prompts now accept optional `signal: AbortSignal` to support programmatic cancellation [source](./.skilld/releases/@clack/prompts@1.0.0.md:L61)

- NEW: Standard Schema validation (v1.5.0) — `validate` option now accepts schema objects following Standard Schema specification (Arktype, Zod, etc.) alongside function validators [source](./.skilld/releases/@clack/prompts@1.5.0.md:L11)

### Option Changes

- NEW: `showInstructions` option (v1.7.0) — added to `select()`, `multiselect()`, and `groupMultiselect()`. Controls keyboard hint visibility; defaults to `true` to show hints [source](./.skilld/releases/@clack/prompts@1.7.0.md:L11)

- NEW: `maxItems` option (v1.4.0) — added to `groupMultiselect()` for scrolling support alongside vertical list constraint [source](./.skilld/releases/@clack/prompts@1.4.0.md:L11)

- NEW: `clearOnError` option (v1.0.0) — added to `password()` prompt to auto-clear input when validation fails [source](./.skilld/releases/@clack/prompts@1.0.0.md:L99)

- NEW: `groupSpacing` option (v1.0.0) — added to `groupMultiselect()` to insert blank lines between groups (integer > 0) [source](./.skilld/releases/@clack/prompts@1.0.0.md:L57)

- NEW: `selectableGroups` option (v1.0.0) — added to `groupMultiselect()`. Set to `false` to disable top-level group selection whilst allowing child selection [source](./.skilld/releases/@clack/prompts@1.0.0.md:L121)

- NEW: `placeholder` option (v1.2.0) — added to `autocomplete()`. When set and input empty, pressing Tab applies the placeholder value [source](./.skilld/releases/@clack/prompts@1.2.0.md:L17)

- NEW: `styleFrame` option (v1.0.0) — added to `spinner()` for custom frame styling [source](./.skilld/releases/@clack/prompts@1.0.0.md:L21)

- NEW: Custom frames support (v1.0.0) — `spinner()` accepts `frames` option for custom loading animations [source](./.skilld/releases/@clack/prompts@1.0.0.md:L103)

- NEW: Custom `output` and `input` streams (v1.0.0) — all prompts accept optional `output` and `input` stream overrides [source](./.skilld/releases/@clack/prompts@1.0.0.md:L124)

- NEW: `required` option (v1.0.0) — added to `autocompleteMultiselect()` [source](./.skilld/releases/@clack/prompts@1.0.0.md:L101)

- CHANGED: `note()` `format` parameter (v1.0.0) — new option to format individual lines, and v1.6.0 changed default behaviour (no longer dims) [source](./.skilld/releases/@clack/prompts@1.0.0.md:L25)

- CHANGED: Keyboard instruction footers (v1.6.0) — automatically added to `select()`, `multiselect()`, and `groupMultiselect()` in active state (no option to disable) [source](./.skilld/releases/@clack/prompts@1.6.0.md:L26)

- CHANGED: `withGuide` indent behaviour (v1.4.0) — `withGuide: false` now removes indent from `groupMultiselect()` [source](./.skilld/releases/@clack/prompts@1.4.0.md:L11)

### Return Value Changes

- CHANGED: `userInput` property (v1.0.0) — prompts now store `userInput` separately from their final `value` [source](./.skilld/releases/@clack/prompts@1.0.0.md:L19)

- CHANGED: `SpinnerResult` type exposed (v1.0.0) — new type exported to describe spinner return value [source](./.skilld/releases/@clack/prompts@1.0.0.md:L115)

### Settings & Customization

- NEW: `updateSettings()` function (v1.0.0) — supports global keybinding aliases (`aliases: { w: 'up', ... }`) and spinner message customization (`messages: { cancel: '...', error: '...' }`) [source](./.skilld/releases/@clack/prompts@1.0.0.md:L29)

- NEW: `settings` export (v1.0.0) — direct access to global settings (e.g. `prompts.settings.messages.cancel`) [source](./.skilld/releases/@clack/prompts@1.0.0.md:L49)

- NEW: Per-instance spinner messages (v1.0.0) — `spinner()` options now accept `cancelMessage` and `errorMessage` to override global settings [source](./.skilld/releases/@clack/prompts@1.0.0.md:L35)

Also changed: `selectableGroups` for multiselect control · `caseSensitive` option for `selectKey()` · `withGuide` support expanded to all prompts · `placeholder` as visual hint rather than tabbable value · wrapping support for `autocomplete` and `select` · empty array handling across prompts
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices for @clack/prompts v1.7.0

## Best Practices

- Always wrap prompt chains with `intro()` at the start and `outro()` at the end to frame the interactive session and provide clear visual boundaries [source](./../docs/docs/clack/basics/getting-started.md:L49:84)

- Use Standard Schema validation libraries (e.g. Arktype) with the `validate` option instead of custom validation functions for type-safe, concise validation logic [source](./.skilld/releases/@clack/prompts@1.5.0.md:L10:26)

- Handle cancellation consistently in every prompt by checking `isCancel()` and calling `cancel()` before exiting — this provides proper cleanup and user-facing cancellation messages [source](./README.md:L31:45)

- Use `group()` to manage related prompts together and share context via the `results` parameter, but note that TypeScript type inference has limitations when accessing nested results in conditional prompts [source](./../docs/docs/clack/basics/getting-started.md:L85:109)

- For streaming output from dynamic LLMs or async iterables, use the `stream` API family (`stream.info()`, `stream.success()`, etc.) instead of direct logging — this handles formatting and buffering correctly [source](./README.md:L359:372)

- Control keyboard instruction visibility with the `showInstructions` option on `select`, `multiselect`, and `groupMultiselect` — hide them for compact UIs or when space is tight by passing `showInstructions: false` [source](./.skilld/releases/@clack/prompts@1.7.0.md:L10:11)

- Use `taskLog()` for subprocess output that should persist during execution then clear on success — this reduces terminal noise for long-running tasks with optional `title` parameter [source](./README.md:L376:396)

- Avoid returning custom symbols from `select()` options — `isCancel()` type narrowing relies on detecting `CANCEL_SYMBOL` specifically, and custom symbols will not narrow properly [source](./.skilld/issues/issue-600.md:L23:66)

- For multiline text input with explicit submission, pass `showSubmit: true` instead of relying on double-Enter convention — this makes submission mechanics obvious to users [source](./README.md:L239:246)

- Use `path()` prompt for filesystem selection instead of plain `text()` — it provides autocomplete and directory/file filtering built-in, improving UX for file picking workflows [source](./README.md:L248:259)

- Structure prompt validation in `group()` using conditional functions that return early with falsy values (e.g., `return false`) rather than throwing errors — this keeps validation compatible with the group callback signature [source](./../docs/docs/clack/basics/getting-started.md:L100:121)

- When customising `note()` formatting, use `node:util`'s `styleText()` if you need features like dimmed text, as the default formatter was updated in v1.6.0 to remove dim styling [source](./.skilld/releases/@clack/prompts@1.6.0.md:L10:25)

- Pass empty option arrays to list-based prompts confidently — v1.7.0 added explicit handling for empty arrays across `select`, `multiselect`, and `groupMultiselect` [source](./.skilld/releases/@clack/prompts@1.7.0.md:L14:15)

- For non-interactive environments (CI, piped stdin), the library detects non-TTY streams and gracefully degrades — verify your error handling works without interactive fallback since prompts will resolve immediately or fail [source](./.skilld/issues/issue-286.md:L12:15)
<!-- /skilld:best-practices -->
