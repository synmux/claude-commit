---
name: types-bun-skilld
description: "TypeScript definitions for bun. ALWAYS use when writing code importing \"@types/bun\". Consult for debugging, best practices, or modifying @types/bun, types/bun, types bun, DefinitelyTyped."
metadata:
  version: 1.3.14
  generated_by: cached
  generated_at: 2026-06-30
---

# DefinitelyTyped/DefinitelyTyped `@types/bun@1.3.14`
**Tags:** ts4.6: 1.0.8, ts4.7: 1.1.5, ts4.8: 1.1.13

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Discussions](./.skilld/discussions/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @types/bun` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @types/bun` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes in @types/bun v1.3.14 — prioritize recent breaking changes and migrations.

- DEPRECATED: `readableStreamToBytes()` — replaced by `ReadableStream.bytes()` method since v1.x [source](./.skilld/pkg/deprecated.d.ts:L44)

- DEPRECATED: `readableStreamToBlob()` — replaced by `ReadableStream.blob()` method since v1.x [source](./.skilld/pkg/deprecated.d.ts:L58)

- DEPRECATED: `readableStreamToText()` — replaced by `ReadableStream.text()` method since v1.x [source](./.skilld/pkg/deprecated.d.ts:L70)

- DEPRECATED: `readableStreamToJSON()` — replaced by `ReadableStream.json()` method since v1.x [source](./.skilld/pkg/deprecated.d.ts:L82)

- DEPRECATED: `ServeOptions<T>` type — use `Serve.Options<T>` instead [source](./.skilld/pkg/deprecated.d.ts:L104)

- NEW: `Statement.columnTypes` property — get runtime column types from sqlite prepared statements, added v1.2.13 [source](./.skilld/pkg/sqlite.d.ts:L829)

- NEW: `Statement.declaredTypes` property — get declared column types from table schema in sqlite, added v1.2.13 [source](./.skilld/pkg/sqlite.d.ts:L864)

- DEPRECATED: `Errorlike` type — renamed to `ErrorLike` [source](./.skilld/pkg/deprecated.d.ts:L119)

- DEPRECATED: `BuildError` variable — renamed to `BuildMessage` [source](./.skilld/pkg/deprecated.d.ts:L179)

- DEPRECATED: `ResolveError` variable — renamed to `ResolveMessage` [source](./.skilld/pkg/deprecated.d.ts:L184)

- DEPRECATED: TLSOptions properties — `keyFile`, `certFile`, `caFile` (since v0.6.3) — use `key: Bun.file(path)`, `cert: Bun.file(path)`, `ca: Bun.file(path)` instead [source](./.skilld/pkg/deprecated.d.ts:L132:L150)

- BREAKING: `WebSocket` static constants deprecated — use instance properties instead: `.CONNECTING`, `.OPEN`, `.CLOSING`, `.CLOSED` now instance properties [source](./.skilld/pkg/bun.d.ts:L4444:L4450)

- DEPRECATED: `Database.exec()` — method alias, prefer `Database.run()` instead [source](./.skilld/pkg/sqlite.d.ts:L191)

**Also changed:** `Bun.Spawn` import deprecated · `readableStreamToBlob.formData()` on Blob · `CustomEvent.initCustomEvent()` deprecated · `DOMException.code` deprecated · `Platform` type unused · `Architecture` type unused · `ShellFunction` type unused · `ReadableIO` type unused · `Process.assert()` use "node:assert" instead · `BunMessageEvent.initMessageEvent()` deprecated
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Include `"types": ["bun"]` in `compilerOptions` for TypeScript 6.0+ — enables proper type inference for the Bun global [source](./.skilld/docs/typescript.mdx:L43)

- Set `"module": "Preserve"` in `tsconfig.json` — allows extensioned .ts imports which Bun natively supports [source](./.skilld/docs/typescript.mdx:L38)

- Use `"moduleResolution": "bundler"` for Bun projects — enables correct module resolution for bundler-aware codebases [source](./.skilld/docs/typescript.mdx:L40)

- Enable `allowImportingTsExtensions` and `verbatimModuleSyntax` in tsconfig — required to support `.ts` imports in development without transformation errors [source](./.skilld/docs/typescript.mdx:L41,L42)

- BunFile instances are lazy and never perform I/O until contents are read — design code to stream or iterate over large files instead of loading entirely into memory [source](./.skilld/pkg/bun.d.ts:L4127-4130)

- Bun automatically detects MIME type from file extension when using `Bun.file()` — avoids manual type inference and enables correct response headers [source](./.skilld/pkg/bun.d.ts:L4086-4088)

- Avoid file slicing operations with `begin > 0` on macOS — they are significantly slower due to system call differences; prefer full-file reads when possible [source](./.skilld/pkg/bun.d.ts:L2124-2126)

- Use `Bun.allocUnsafe()` for performance-critical allocations where speed matters — 3.5x faster than `new Uint8Array(size)` but requires careful handling to prevent memory leaks from uninitialized bytes [source](./.skilld/pkg/bun.d.ts:L4149-4152)

```ts
// Only use when you will immediately initialize all bytes
const buffer = Bun.allocUnsafe(1024);
// Fill every byte before using
```

- Enable `"strict": true` in compiler options — Bun's type definitions are fully strict-compatible and best practices align with strict type checking [source](./.skilld/docs/typescript.mdx:L47)

- Set `"skipLibCheck": true` — improves TypeScript compilation speed significantly without sacrificing type safety in your code [source](./.skilld/docs/typescript.mdx:L48)

- Use `"jsx": "react-jsx"` for automatic JSX element transformation — Bun's type definitions assume this setting for JSX support [source](./.skilld/docs/typescript.mdx:L40)

- Set `"lib": ["ESNext"]` and `"target": "ESNext"` — Bun supports all modern JavaScript features (top-level await, decorators, etc.) and type definitions target ESNext [source](./.skilld/docs/typescript.mdx:L37,L38)
<!-- /skilld:best-practices -->
