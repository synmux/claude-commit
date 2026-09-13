---
name: esbuild-skilld
description: "ALWAYS use when writing code importing \"esbuild\". Consult for debugging, best practices, or modifying esbuild."
metadata:
  version: 0.27.7
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-09-13
---

# evanw/esbuild `esbuild@0.27.7`
**Tags:** latest: 0.28.2

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p esbuild` instead of grepping `.skilld/` directories. Run `skilld search --guide -p esbuild` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes — prioritise recent major/minor releases and breaking changes.

- BREAKING: `binary` loader now uses `Uint8Array.fromBase64` — v0.27.0 changed to use the native Web API when available, which requires setting `target` to a newer environment (e.g., `--target=node22`) if not using Node v25+ [source](./.skilld/releases/v0.27.0.md#use-uint8arrayfrombase64-if-available)

- NEW: `with { type: 'text' }` import syntax — v0.28.0 added support for the import text proposal (stage 3), equivalent to esbuild's existing `text` loader [source](./.skilld/releases/v0.28.0.md#add-support-for-with--type--text--imports)

- BREAKING: `using` declarations now forbidden inside switch clauses — v0.27.2 removed support for `using` declarations directly in `case`/`default` bodies because of scope confusion; wrap bodies in `{ }` blocks instead [source](./.skilld/releases/v0.27.2.md#forbid-using-declarations-inside-switch-clauses)

- NEW: `watch()` API `delay` option — v0.25.6 added optional `delay` parameter (milliseconds) to rebuild delay; also available via `--watch-delay=` CLI flag [source](./.skilld/releases/v0.25.6.md#support-a-configurable-delay-in-watch-mode-before-rebuilding)

- NEW: `entryPoints` mixed array support — v0.25.6 relaxed TypeScript type definitions to accept mixed arrays of strings and objects, e.g., `['foo.js', { in: 'bar.js', out: 'lib' }]` [source](./.skilld/releases/v0.25.6.md#allow-mixed-array-for-entrypoints-api-option)

- NEW: import path specifiers with `#/` prefix — v0.27.2 lifted the package.json restriction to allow `#/` patterns (e.g., `#/*` mapping to `./src/*`) [source](./.skilld/releases/v0.27.2.md#allow-import-path-specifiers-starting-with-1)

- NEW: `es2025` target in tsconfig.json — v0.27.5 added support for TypeScript's `ES2025` compilation target to determine class field lowering behaviour [source](./.skilld/releases/v0.27.5.md#allow-es2025-as-a-target-in-tsconfigjson)

- NEW: TypeScript parameter property lowering — v0.27.5 implements define semantics for parameter properties when `"useDefineForClassFields": true` is set, generating explicit class field declarations [source](./.skilld/releases/v0.27.5.md#use-define-semantics-for-typescript-parameter-properties)

- BREAKING: Operating system requirements raised in v0.27.0 — Go compiler upgrade requires Linux kernel 3.2+ (previously 2.6.32+) and macOS 12+ (Monterey, previously 10.13+) [source](./.skilld/releases/v0.27.0.md#update-the-go-compiler-from-v12312-to-v1254)

**Also changed:** `log-style=visualstudio` new in v0.28.2 · Import alias tree-shaking fixed v0.28.2 · CSS `@scope` rule support v0.27.3 · Symbol tree-shaking improved v0.27.1
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Prefer ES6 module syntax (`import`/`export`) over CommonJS when possible — esbuild applies scope hoisting to ES6 modules, which merges scopes across files and enables aggressive tree-shaking, whereas CommonJS modules are wrapped in closures for correctness [source](./.skilld/docs/architecture.md#es6-linking)

- Avoid `export * as namespace` re-exports when optimal tree-shaking is critical — esbuild only tracks imports through one level and cannot tree-shake namespace re-exports, a limitation not present in Webpack 5+. Use direct named exports or plugin-based solutions instead [source](./.skilld/issues/issue-1420.md:L89:92)

- Use `external` for Node.js built-in modules instead of bundling or attempting dynamic require conversion — esbuild will not transform `require()` calls for external packages when targeting ESM, resulting in "Dynamic require is not supported" errors at runtime. Mark them as external and let the runtime handle them [source](./.skilld/issues/issue-1921.md:L1:25)

- Set an explicit `target` when using newer JavaScript features — recent versions introduced `Uint8Array.fromBase64` in the binary loader, which requires `target: "node22"` or later on Node.js. Without specifying target, the feature may fail on older runtimes [source](./.skilld/repos/evanw/esbuild/releases/v0.27.0.md:L11:13)

- Apply `useDefineForClassFields: true` in `tsconfig.json` for TypeScript parameter properties — esbuild now respects this flag and generates class field declarations for constructor parameters prefixed with visibility modifiers, ensuring consistency with the TypeScript compiler [source](./.skilld/repos/evanw/esbuild/releases/v0.27.5.md:L28:51)

- Use `define` for environment-specific code elimination at bundle time — esbuild performs constant folding on compile-time definitions, enabling tree-shaking of entire branches (e.g. `--define:process.env.NODE_ENV="production"` removes development-only code without runtime overhead) [source](./.skilld/docs/architecture.md#constant-folding)

- Expect code splitting to create many small chunks rather than consolidate — esbuild's splitting algorithm does not account for whether shared code is already loaded in parent entry points, creating micro-chunks (2-5KB) that may individually degrade performance. Consider bundling strategies or plugin-based chunk consolidation [source](./.skilld/issues/issue-3780.md:L14:31)

- Respect module import order guarantees when using code splitting with multiple entry points — ES module import order is not guaranteed across parallel downloads; esbuild may hoist imports past side effects when splitting code. Structure code so initialization is not order-dependent [source](./.skilld/issues/issue-399.md:L66:87)

- Use `mangleCache` to persist identifier mappings across incremental builds — esbuild's minifier can mangle property names and variable identifiers; without a persistent cache, names will differ on each build, breaking compatibility with externally-generated code expecting stable names [source](./.skilld/pkg/lib/main.d.ts:L37)

- Limit usage of `keepNames` to functions that genuinely require readable names at runtime — esbuild inlines `__name()` helper calls even when names haven't changed, increasing bundle size. Consider conditionally enabling this only for debugging builds or via `define` flags [source](./.skilld/issues/issue-2605.md:L1:19)

- Enable `sourcemap: "inline"` or `"external"` for development, not production — inline source maps bloat output; external maps require separate files and serve requests. Production builds should omit source maps or use `linked` to reference external maps only when debugging is necessary [source](./.skilld/pkg/lib/main.d.ts:L11)

- Use `sourcefile` in the `stdin` API to ensure accurate source map paths — when bundling from stdin without a real file, esbuild needs explicit `sourcefile` to generate correct source map references and asset paths [source](./.skilld/pkg/lib/main.d.ts:L179)

- Specify `outbase` when bundling multiple entry points to control output directory structure — without `outbase`, esbuild's path resolution may produce unexpected nesting. Set it to the common ancestor directory of all entry points [source](./.skilld/pkg/lib/main.d.ts:L127)

- Be aware that huge metafiles can cause JavaScript API failures — when `metafile: true` generates extremely large JSON (pathologically-sized bundles), V8's string length limits may break JSON parsing. Consider using the command-line API or splitting the build if metafile size becomes problematic [source](./.skilld/repos/evanw/esbuild/releases/v0.27.4.md:L53:58)
<!-- /skilld:best-practices -->
