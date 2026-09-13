---
name: clack-core-skilld
description: "ALWAYS use when writing code importing \"@clack/core\". Consult for debugging, best practices, or modifying @clack/core, clack/core, clack core, clack."
metadata:
  version: 1.4.3
  generated_by: cached
  generated_at: 2026-09-13
---

# bombshell-dev/clack `@clack/core@1.4.3`
**Tags:** alpha: 1.0.0-alpha.8, latest: 1.5.1

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @clack/core` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @clack/core` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes — prioritise recent major/minor releases.

- BREAKING: ESM-only distribution — v1.0.0 dropped CommonJS support. CJS projects on Node v20+ must use dynamic `import()` [source](./.skilld/releases/@clack/core@1.0.0.md:L11)

- BREAKING: `picocolors` removed — v1.1.0 replaced with Node.js built-in `styleText`. Any code importing or re-exporting picocolors will fail [source](./.skilld/releases/@clack/core@1.1.0.md:L11)

- BREAKING: `suggestion` prompt removed — v1.0.0 removed this prompt type entirely. Use `autocomplete` instead [source](./.skilld/releases/@clack/core@1.0.0.md:L53)

- BREAKING: `path` prompt signature changed — v1.0.0 converted from a dedicated prompt to an `autocomplete`-based prompt with different behaviour [source](./.skilld/releases/@clack/core@1.0.0.md:L53)

- BREAKING: `debug` option removed — v1.3.0 removed the unused `debug` option from prompts. Any code passing this option will silently ignore it [source](./.skilld/releases/@clack/core@1.3.0.md:L11)

- BREAKING: `placeholder` now visual-only — v1.0.0 changed placeholder behaviour from being set as value to being a pure visual hint; pressing Enter on empty input no longer returns the placeholder [source](./.skilld/releases/@clack/core@1.0.0.md:L94)

- BREAKING: `password` prompt empty return — v1.4.2 changed empty submissions from `undefined` to empty string `""` to match `text` prompt and documented return type `Promise<string | symbol>` [source](./.skilld/releases/@clack/core@1.4.2.md:L11)

- NEW: `userInput` property — v1.0.0 introduced separate tracking of raw user input vs. processed value on all prompts [source](./.skilld/releases/@clack/core@1.0.0.md:L17)

- NEW: `date` prompt — v1.2.0 added date prompt with format support (YMD, MDY, DMY) [source](./.skilld/releases/@clack/core@1.2.0.md:L12)

- NEW: `multiline` prompt — v1.3.0 added multiline text input prompt for multi-line content [source](./.skilld/releases/@clack/core@1.3.0.md:L14)

- NEW: Standard Schema validation — v1.4.0 added native support for Standard Schema libraries (Arktype, Zod with adapter, etc.) via `validate` option [source](./.skilld/releases/@clack/core@1.4.0.md:L11)

- NEW: Spinner message customisation — v1.0.0 added `cancelMessage` and `errorMessage` options per-instance and globally via `updateSettings()` [source](./.skilld/releases/@clack/core@1.0.0.md:L21)

- NEW: `clearOnError` option — v1.0.0 added `clearOnError` boolean to password prompt to automatically clear input on validation failure [source](./.skilld/releases/@clack/core@1.0.0.md:L55)

- NEW: `selectableGroups` option — v1.0.0 added boolean to group multi-select to allow disabling top-level group selection whilst keeping child selection enabled [source](./.skilld/releases/@clack/core@1.0.0.md:L61)

- NEW: `withGuide` option — v1.0.0 added option to disable default clack border on prompts [source](./.skilld/releases/@clack/core@1.0.0.md:L73)

- NEW: `caseSensitive` option — v1.0.0 added case-sensitive matching to select-key prompt [source](./.skilld/releases/@clack/core@1.0.0.md:L74)

- NEW: `placeholder` for autocomplete — v1.2.0 added placeholder option to autocomplete; pressing Tab on empty input sets value to placeholder [source](./.skilld/releases/@clack/core@1.2.0.md:L16)

**Also changed:** `AutocompletePrompt` added to core v1.0.0 · `allowDisabledOptions` in select/multiselect v1.0.0 · `multiline` initial value handling improved v1.4.2 · `fast-string-width` and `fast-wrap-ansi` externalized v1.2.0 · wrapping support for autocomplete and select prompts v1.0.0
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Always check `isCancel()` before accessing prompt results — cancellation returns a sentinel symbol, and accessing properties on it will throw — use it as a type guard to narrow results safely [source](./.skilld/pkg/README.md)

- Provide custom input and output streams to Prompt constructors for testability — this enables driving real prompts through fake stdin/stdout in test suites without requiring a TTY [source](./.skilld/pkg-core/../docs/docs/clack/basics/getting-started.md:L114)

- Use Standard Schema validation libraries (Arktype, Zod, Valibot) via the `validate` option instead of custom functions for complex validation logic — these provide type inference, reusable schemas, and cleaner syntax without manual error handling [source](./.skilld/pkg/CHANGELOG.md:L30)

- Separate UI rendering from prompt logic by extracting render functions to pure functions — this allows testing frame output without a terminal and enables previewing state changes [source](./.skilld/releases/@clack/core@1.3.0.md)

- Track both `userInput` and `value` separately — `userInput` is the raw string entered, while `value` is the processed result; access `userInputWithCursor` in render functions to show cursor position [source](./.skilld/pkg-core/../docs/docs/clack/basics/getting-started.md:L118)

- Listen to `key` events to intercept keystrokes and implement custom behaviour — this allows mapping application-specific shortcuts (e.g. 'e' for edit, 'q' for quit) without blocking Clack's default keybindings [source](./.skilld/pkg-core/dist/index.d.mts:L87)

- Use `SelectKeyPrompt` instead of `SelectPrompt` when each option is keyed on a single character — it's designed for single-keypress selection and handles `caseSensitive` option for case-aware matching [source](./.skilld/pkg-core/dist/index.d.mts:L432)

- Use `updateSettings()` at startup to customize global keybindings, messages, and date localization — these settings apply to all subsequent prompts and avoid repetition across your CLI [source](./.skilld/pkg/CHANGELOG.md:L104)

- Provide an `AbortSignal` via the `signal` option to enable programmatic prompt cancellation without user interaction — useful for timeouts, parent control flow, or external events [source](./.skilld/pkg/CHANGELOG.md:L190)

- Use `getColumns()` and `getRows()` to query terminal dimensions in render functions — wrap long text with `wrapTextWithPrefix()` to respect terminal width and prevent overflow [source](./.skilld/pkg-core/dist/index.d.mts:L464)

- Validate immediately on initial values with the `validate` option — Clack shows validation errors at render time, not just on submit, catching invalid defaults early [source](./.skilld/pkg/CHANGELOG.md:L148)

- Call `block()` to manage raw mode during long-running operations — it hides the cursor and disables input, then returns a cleanup function to restore the terminal state [source](./.skilld/pkg-core/dist/index.d.mts:L463)

- Handle empty arrays safely in option lists — since v1.4.3, Clack handles empty `options` arrays gracefully instead of throwing; always pass at least one option or validate before rendering [source](./.skilld/pkg/CHANGELOG.md:L11)
<!-- /skilld:best-practices -->
