---
name: types-picomatch-skilld
description: "ALWAYS use when writing code importing \"@types/picomatch\". Consult for debugging, best practices, or modifying @types/picomatch, types/picomatch, types picomatch, DefinitelyTyped."
metadata:
  version: 4.0.3
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-09-13
---

# DefinitelyTyped/DefinitelyTyped `@types/picomatch@4.0.3`
**Tags:** ts3.4: 2.2.1, ts3.1: 2.2.1, ts3.0: 2.2.1

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Discussions](./.skilld/discussions/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @types/picomatch` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @types/picomatch` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes for @types/picomatch v4.0.3 and the underlying picomatch library.

- BREAKING: `PicomatchOptions.unixify` — renamed to `windows` option in v2.0.0 [source](./.skilld/docs/admin.md#overview)

- BREAKING: Caching methods and `cache` option — completely removed in v2.0.0, all caching-related APIs no longer available [source](./.skilld/pkg-picomatch/releases/CHANGELOG.md#200-2019-04-10)

- BREAKING: Process global and Node.js dependencies — removed in v4.0.0 to support browser environments; `os` module removed; picomatch now works outside of Node.js [source](./.skilld/pkg-picomatch/releases/CHANGELOG.md#400-2024-02-07)

- NEW: `onIgnore` callback option — added in v2.0.0, called when items are ignored [source](./.skilld/pkg/lib/picomatch.d.ts:L149)

- NEW: `onMatch` callback option — added in v1.0.0, called when items are matched [source](./.skilld/pkg/lib/picomatch.d.ts:L153)

- NEW: `onResult` callback option — added in v2.0.0, called on all items regardless of match status [source](./.skilld/pkg/lib/picomatch.d.ts:L157)

- ENHANCED: `scan()` return type — added `tokens`, `slashes`, and `parts` properties in v2.2.0 for better pattern analysis [source](./.skilld/pkg/lib/scan.d.ts:L47-49)

- NEW: `scan.Options.tokens` — enable token array in scan results (v2.2.0) [source](./.skilld/pkg/lib/scan.d.ts:L19)

- NEW: `scan.Options.parts` — enable path segment array in scan results (v2.2.0) [source](./.skilld/pkg/lib/scan.d.ts:L9)

- NEW: `scan.Options.nonegate` — disable negation support in scan (v2.1.0) [source](./.skilld/pkg/lib/scan.d.ts:L12)

- ENHANCED: `PicomatchOptions` parameter count — `expandRange` now supports both 3-parameter `(from, to, options)` and 4-parameter `(from, to, step, options)` signatures [source](./.skilld/pkg/lib/picomatch.d.ts:L84-85)

- NEW: `windows` option — replaces `unixify`, when true accepts backslashes as path separators (v2.0.0) [source](./.skilld/pkg/lib/picomatch.d.ts:L185)

- NEW: `Result.match` property — contains regex match results from pattern matching [source](./.skilld/pkg/lib/picomatch.d.ts:L49)

- NEW: `Result.isMatch` property — boolean indicating match status in result object [source](./.skilld/pkg/lib/picomatch.d.ts:L50)

**Also changed:** `scan.State.negatedExtglob` property · `ParseState.negatedExtglob` property · `toRegexOptions` type with flags/nocase/debug subset · `compileRe` and `makeRe` support returnOutput/returnState parameters
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Use `picomatch()` with the generic `returnState` parameter (`true`) when you need access to parse state and metadata — the `MatcherWithState` interface includes the compiled `state` property for advanced pattern introspection [source](./.skilld/pkg/lib/picomatch.d.ts:L24:28)

- Pass `returnObject: true` to the returned matcher function to receive a `Result` object with regex, output, and match details — enables debugging and advanced matching workflows without re-parsing [source](./.skilld/pkg/lib/picomatch.d.ts:L33:51)

- Set `basename: true` (or its alias `matchBase: true`) when matching against file paths with slashes to match patterns against the basename only — `a?b` matches `/xyz/acb` but not `/xyz/123/acb` [source](./.skilld/pkg/lib/picomatch.d.ts:L54:58)

- Enable `dot: true` explicitly when glob patterns must match dotfiles — by default, dotfiles are ignored unless a `.` is explicit in the pattern, matching bash behaviour [source](./.skilld/pkg/lib/picomatch.d.ts:L76:78)

- Disable `fastpaths: false` only if you need guaranteed consistency across all glob patterns — fast paths skip full parsing for common patterns but may skip custom behaviour from options or callbacks [source](./.skilld/pkg/lib/picomatch.d.ts:L87:89)

- Use the `ignore` option with one or more glob patterns to exclude results inline, rather than post-filtering matches — picomatch handles negation efficiently and applies the `onIgnore` callback [source](./.skilld/pkg/lib/picomatch.d.ts:L99:101)

- Set `maxLength` to enforce maximum input string length for security — throws an error if the input exceeds the limit, preventing potential denial-of-service with extremely long strings [source](./.skilld/pkg/lib/picomatch.d.ts:L115:117)

- Use `expandRange` callback with wrapped parentheses to customise brace expansion (e.g. `{a..z}`) — the function receives range bounds and step, enabling pattern-specific range handling [source](./.skilld/pkg/lib/picomatch.d.ts:L83:85)

- Apply `format` function to transform paths in the generated regex output — useful for normalising Windows paths to POSIX, removing leading slashes, or other path conversions [source](./.skilld/pkg/lib/picomatch.d.ts:L95:97)

- Set `bash: true` to follow bash matching rules strictly — disallows backslashes as escape characters and treats single stars as globstars, improving compatibility with bash glob semantics [source](./.skilld/pkg/lib/picomatch.d.ts:L60:62)

- Use the `onMatch`, `onIgnore`, and `onResult` callbacks for side effects and filtering — avoid post-hoc filtering loops; callbacks execute during matching and receive the full `Result` object with context [source](./.skilld/pkg/lib/picomatch.d.ts:L149:157)

- Prefer `picomatch.isMatch()` for simple boolean checks against patterns — skips matcher function creation overhead when you only need true/false results [source](./.skilld/pkg/lib/picomatch.d.ts:L197)

- Use `picomatch.scan()` with `tokens: true` to analyze pattern structure before matching — enables advanced use cases like pattern validation, transformation, or explaining matches without executing the full regex [source](./.skilld/pkg-picomatch/lib/scan.d.ts:L4:28)
<!-- /skilld:best-practices -->
