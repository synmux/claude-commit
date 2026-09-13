---
name: vitest-skilld
description: "ALWAYS use when writing code importing \"vitest\". Consult for debugging, best practices, or modifying vitest."
metadata:
  version: 4.1.11
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-09-13
---

# vitest-dev/vitest `vitest@4.1.11`
**Tags:** V3: 3.2.7, beta: 5.0.0-beta.7, rc: 5.0.0-rc.4

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Discussions](./.skilld/discussions/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p vitest` instead of grepping `.skilld/` directories. Run `skilld search --guide -p vitest` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes — prioritise recent major/minor releases.

### Breaking Changes (v5.0.0)

- BREAKING: `sequential` test/suite option — removed entirely in v5.0.0, use `concurrent: false` instead [source](./.skilld/releases/v5.0.0.md:L16)

- BREAKING: `vi.clearMocks()` default behaviour — mocks are now cleared automatically before each test in v5.0.0, no explicit call needed; configure with `clearMocks: false` in config if required [source](./.skilld/releases/v5.0.0.md:L31)

- BREAKING: `@vitest/runner` package — inlined into `vitest` in v5.0.0, no longer a separate published package; import from `vitest` instead [source](./.skilld/releases/v5.0.0.md:L25)

- BREAKING: Entry points — many `vitest/*` entry points removed in v5.0.0; migrate to main exports or use explicit subpath exports [source](./.skilld/releases/v5.0.0.md:L19)

- BREAKING: `@vitest/expect` package — inlined into `vitest` in v5.0.0, remove separate import; use `vitest` for expect API [source](./.skilld/releases/v5.0.0.md:L18)

- BREAKING: `expect.poll()` timeout behaviour — now fails test when function didn't resolve in time instead of silently continuing in v5.0.0 [source](./.skilld/releases/v5.0.0.md:L21)

- BREAKING: `toHaveTextContent()` assertion — strict mode enabled in v5.0.0, changed from partial matching; use `toMatchTextContent()` for old behaviour [source](./.skilld/releases/v5.0.0.md:L23)

- BREAKING: Config file lookup — no longer searches ancestor directories starting in v5.0.0 for security; place `vitest.config.*` in project root [source](./.skilld/releases/v5.0.0.md:L24)

### New APIs (v4.1.0)

- NEW: `aroundEach()` and `aroundAll()` hooks — new lifecycle hooks for setup/teardown with automatic cleanup in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L23)

- NEW: `test.extend({ fixture })` with type inference — improved fixture API with better TypeScript support in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L27)

- NEW: `vi.mockThrow()` and `vi.mockThrowOnce()` — new mock helpers for error-throwing scenarios in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L33)

- NEW: `doMock()` returns `Disposable` — `vi.doMock()` now returns disposable object for manual teardown in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L15)

- NEW: Test tags support — `test(..., { tags: ['tag-name'] })` option for filtering and grouping tests in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L22)

- NEW: `setTickMode()` for timer control — extended fake timer API with `setTickMode('modern' | 'legacy')` in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L17)

- NEW: `page.mark()` Playwright API — browser.mark and context.mark for custom trace annotations in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L36)

- NEW: `userEvent.wheel()` browser API — new pointer event method for wheel scrolling in v4.1.0 [source](./.skilld/releases/v4.1.0.md:L44)

### Promoted from Experimental (v5.0.0)

- STABLE: `parseSpecifications()` — promoted from experimental in v5.0.0, now stable public API [source](./.skilld/releases/v5.0.0.md:L77)

- STABLE: `clearCache()` — promoted from experimental in v5.0.0, now stable public API [source](./.skilld/releases/v5.0.0.md:L78)

### Deprecated APIs (v4.1.0)

- DEPRECATED: `toBe*` spy assertions — `toBeCalledWith()`, `toBeCalledTimes()` etc. deprecated in v4.1.0; use `toHaveBeenCalledWith()`, `toHaveBeenCalledTimes()` instead [source](./.skilld/releases/v4.1.0.md:L104)

- DEPRECATED: `vitest/*` entry points — several entry points marked for removal in v4.1.0; migrate to main API [source](./.skilld/releases/v4.1.0.md:L76)

**Also changed:** `vi.when()` added v5.0 · Matcher types exposed v4.1.0 · `toTestSpecification` in task API v4.1.0 · `vitest list` static collection v4.1.0 · `--detect-async-leaks` CLI flag v4.1.0 · `mockObject` backwards compatibility fix v4.1.0 · Default `attachmentsDir` path changed to `.vitest/attachments/` v5.0.0 · Locator represented as object v5.0.0 · Require Node.js 22+ and Vite 6.4+ v5.0.0 · Bare mocks with automocking v5.0.0 · `injectCjsGlobals` now toggable v5.0.0 · `fsModuleCache` promoted to top-level option v5.0.0
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Use `test.extend()` with the builder pattern (new in 4.1.0) for automatic type inference on fixtures. The recommended approach is to chain `.extend()` calls where TypeScript infers each fixture's type from its return value, eliminating manual type declarations [source](./.skilld/docs/guide/test-context.md#builder-pattern)

- Import `expect` from the test context parameter in concurrent tests to ensure proper snapshot tracking. Global `expect` cannot reliably associate snapshots with specific concurrent tests and may fail to update inline snapshots correctly [source](./.skilld/docs/guide/snapshot.md:L43-44)

- Use `vi.mock()` with dynamic `import('./path/to/module.js')` syntax instead of string paths. This enables IDE refactoring support, automatic path updates when files move, and proper type inference for the `importOriginal` helper [source](./.skilld/docs/api/vi.md:L70-87)

- Enable `clearMocks: true` or `restoreMocks: true` in configuration for automatic mock cleanup between tests. This prevents mock state leaking across tests, but note that `clearMocks` may cause issues in concurrent tests where one test's cleanup affects in-flight concurrent tests [source](./.skilld/docs/config/clearmocks.md)

- Disable test isolation for specific project groups when tests maintain clean state (common with node environment and well-designed tests). Set `isolate: false` per project to improve performance; the overhead of isolation is unnecessary for side-effect-free test files [source](./.skilld/docs/guide/improving-performance.md:L5-53)

- Use `vi.mock(path, { spy: true })` to auto-mock a module while preserving original implementations. This allows asserting calls on functions without overriding their behaviour, combining mocking benefits with real execution [source](./.skilld/docs/api/vi.md:L54-68)

- Use the `annotate()` method from test context to attach metadata (issues, links, screenshots) to tests for reporting. Annotations are displayed by reporters and provide context without littering test code [source](./.skilld/docs/guide/test-context.md:L82-102)

- Use `context.signal` (AbortSignal) for operations that may be cancelled by Vitest (timeouts, manual cancellation, bail). Passing this signal to fetch or async operations ensures they abort gracefully when the test run is stopped [source](./.skilld/docs/guide/test-context.md:L105-118)

- Enable `experimental.fsModuleCache: true` to persist module cache between reruns. Most noticeable when rerunning single tests with large dependency graphs in watch mode; full suite runs already benefit from parallelisation [source](./.skilld/docs/guide/improving-performance.md:L82-92)

- Define tags in configuration and use them to label tests for selective execution and option overrides. Tags with higher priority override those with lower priority; test-level options override all tags, providing a clean precedence model [source](./.skilld/docs/guide/test-tags.md:L6-63)

- Use `defineConfig()` from `vitest/config` instead of plain objects. It provides type safety, IDE autocomplete, and validates configuration at build time rather than runtime [source](./.skilld/docs/guide/improving-performance.md:L18)

- Prefer hoisted `vi.mock()` over `vi.doMock()` for most cases. Hoisting is statically analysed and moved to the top of the file automatically, supporting better bundler handling and avoiding accidental use of non-hoisted variables [source](./.skilld/docs/api/vi.md:L38-124)

- Use `beforeEach()` and `afterEach()` for per-test state setup and cleanup, even in sequential tests. This prevents state pollution in case tests later become concurrent, and isolates failures to individual tests rather than cascading failures [source](./.skilld/docs/guide/learn/setup-teardown.md:L16-44)

- Use `maxConcurrency` configuration to limit concurrent test count when using `test.concurrent()` or `describe.concurrent()`. Without a limit, all concurrent tests run simultaneously; setting a lower limit balances parallelism with memory/resource constraints [source](./.skilld/docs/config/maxconcurrency.md)
<!-- /skilld:best-practices -->

Related: picomatch-skilld
