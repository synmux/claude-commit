---
name: picomatch-skilld
description: "ALWAYS use when writing code importing \"picomatch\". Consult for debugging, best practices, or modifying picomatch."
metadata:
  version: 4.0.7
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-09-13
---

# micromatch/picomatch `picomatch@4.0.7`
**Tags:** latest: 4.0.7

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p picomatch` instead of grepping `.skilld/` directories. Run `skilld search --guide -p picomatch` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

Picomatch maintains a stable API surface across the v4.x release line. The core exported functions—`picomatch()`, `.test()`, `.matchBase()`, `.isMatch()`, `.parse()`, `.scan()`, `.compileRe()`, `.makeRe()`, and `.toRegex()`—remain unchanged since v4.0.0. Recent releases (v4.0.3–v4.0.7) are focused on bug fixes and security improvements rather than API additions or changes.

### Breaking Implementation Changes (v4.0.0)

The v4.0.0 release introduced significant internal changes to support browser environments, which affects runtime behaviour but not the API surface:

- **Windows platform detection now uses both `navigator` and `process`** — v4.0.0 changed from exclusive use of Node.js's `os` module to a dual-detection strategy (`navigator.platform` for browsers, `process.platform` for Node.js). The `windows` option still functions identically in the API, but detection may yield different results in non-Node.js environments [source](./.skilld/releases/CHANGELOG.md:L43:46)

- **Removed `os` module dependency** — v4.0.0 eliminated the `require('os')` call to enable browser compatibility. This is an internal implementation detail; the public API for the `windows` option remains unchanged [source](./.skilld/releases/CHANGELOG.md:L45)

- **`sideEffects: false` added to package.json** — v4.0.0 set `sideEffects` to enable tree-shaking in bundlers. Not an API change, but affects bundle size when using ES modules [source](./.skilld/releases/CHANGELOG.md:L44)

### Bug Fix (v4.0.3)

- **Fixed exception when glob pattern contains `constructor`** — v4.0.3 resolved a silent breakage where patterns like `*constructor*` would throw a TypeError. This corrects matching behavior for a previously broken edge case [source](./.skilld/releases/v4.0.3.md:L10)

### Security Fixes (v4.0.4+)

v4.0.4 and backported fixes address CVE-2026-33671 and CVE-2026-33672 [source](./.skilld/releases/v4.0.4.md:L12:13). These are security updates with no API changes.

**Note:** Picomatch's minimal API surface has remained stable since v4.0.0. No new exports, removals, or signature changes have occurred in v4.x. Users upgrading within v4.x can expect full compatibility.
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Cache the returned matcher function from `picomatch()` and reuse it for multiple matches rather than recreating it each time — the function application is more efficient than regenerating the regex, and the README emphasizes this pattern for performance-sensitive contexts like file watching [source](./.skilld/pkg/README.md:L92-L104)

- Set `regex: true` or `regex: false` explicitly in options rather than relying on implicit defaults — Issue #101 documents that the `regex` option has inconsistent defaults for `+` and `*` quantifiers depending on context, and explicit configuration prevents subtle matching differences [source](./.skilld/issues/issue-101.md)

- Enable `dot: true` when you need to match dotfiles like `.gitignore` or `.env` — by default picomatch ignores hidden files unless they have an explicit `.` in the pattern, and this option ensures predictable matching behaviour [source](./.skilld/pkg/README.md:L326-L332)

- Use `literalBrackets: true` when glob patterns themselves contain bracket characters that should match literally (e.g., matching a file named `[1-5].txt`) — brackets are interpreted as regex character classes by default, and enabling this option treats them as literal characters [source](./.skilld/issues/issue-71.md:L61-L65)

- Set `maxExtglobRecursion` explicitly to prevent overly complex extglob patterns — the default value of `0` treats deeply nested or quantified extglobs like `+(a|aa)` as literal strings for safety, and you can increase this value up to a small number if you trust your patterns [source](./.skilld/pkg/README.md:L342:L343)

- Use the `posix` option to enable POSIX character classes like `[[:alpha:]]` and `[[:digit:]]` — these are disabled by default and require explicit configuration since they are a more advanced feature [source](./.skilld/pkg/README.md:L562-L590)

- Pass custom `expandRange` functions to support numeric ranges in brace expansions — picomatch supports only comma-delimited brace expansion by default (e.g. `{a,b}`), and you can provide a function like `fill-range` to handle ranges such as `{01..25}` [source](./.skilld/pkg/README.md:L402-L432)

- Use `format` option to normalize paths before matching when dealing with mixed path styles — this callback can strip leading `./` or convert Windows paths to POSIX format before the pattern is applied [source](./.skilld/pkg/README.md:L436-L449)

- Set `windows: true` or `posix: true` explicitly to control path separator handling rather than relying on automatic OS detection — this ensures consistent cross-platform behaviour and fixes an edge case documented in v4.0.5 where `windows` option wasn't honoured for basename matching [source](./.skilld/pkg/README.md:L359,./releases/v4.0.5.md:L11)

- Enable `onMatch`, `onIgnore`, and `onResult` callbacks for debugging or tracking which patterns matched — these are useful for building logging or testing utilities around the matcher [source](./.skilld/pkg/README.md:L350-L352)

- Avoid relying on the order of alternatives within negation extglobs — Issue #154 shows that `!(a|b)` and `!(b|a)` can produce different results with certain patterns, so if order-independent negation is critical, test both orderings or restructure the pattern [source](./.skilld/issues/issue-154.md)

- Use `picomatch.scan()` with `tokens: true` to get structured information about a glob pattern for analysis or transformation — the tokens array provides segment-level detail that is useful when building glob-aware tooling [source](./.skilld/pkg/README.md:L367-L397)

- Disable `fastpaths` only when you need predictable regex output for debugging — this option is enabled by default to skip full parsing for common patterns like `*.ext`, and disabling it ensures every pattern goes through the same parser path [source](./.skilld/pkg/README.md:L334)

- Test glob patterns with `basename: true` carefully against paths with multiple directory levels — the option should only affect patterns without slashes, but documented behaviour differs from implementation in some cases, so verify patterns match your expectations [source](./.skilld/issues/issue-89.md)
<!-- /skilld:best-practices -->
