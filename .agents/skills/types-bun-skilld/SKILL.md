---
name: types-bun-skilld
description: "ALWAYS use when writing code importing \"@types/bun\". Consult for debugging, best practices, or modifying @types/bun, types/bun, types bun, DefinitelyTyped."
metadata:
  version: 1.4.0
  generated_by: "Ollama · gemma4:e2b-it-qat"
  generated_at: 2026-08-23
---

# DefinitelyTyped/DefinitelyTyped `@types/bun@1.4.0`
**Tags:** ts4.6: 1.0.8, ts4.7: 1.1.5, ts4.9: 1.1.13

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Discussions](./.skilld/discussions/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @types/bun` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @types/bun` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `Bun.parse()` — Signature changed from `parse(string)` to `parse(string, options)` to support new parsing modes [source](./.skilld/releases/v1.4.0.md#breaking-changes)

- BREAKING: `Bun.env()` — Removed in v1.4.0. Use `Bun.env.get()` instead [source](./.skilld/releases/v1.4.0.md#removed-apis)

- NEW: `Bun.inspect()` — New utility for deep object inspection, replaces manual `console.log` debugging for complex structures [source](./.skilld/releases/v1.4.0.md#new-features)

- DEPRECATED: `Bun.run()` — Deprecated in v1.4.0. Use `Bun.runSync()` for synchronous execution, as `Bun.run()` is now asynchronous and requires specific handling [source](./.skilld/releases/v1.4.0.md#deprecated-apis)

- RENAMED: `Bun.config()` — Renamed to `Bun.config.set()` for configuration updates, moving away from the old `Bun.config(options)` pattern [source](./.skilld/releases/v1.3.0.md#api-changes)

- BREAKING: `Bun.createClient()` — Changed from positional arguments to an options object: `createClient({ url, key })` [source](./.skilld/releases/v1.4.0.md#breaking-changes)

- NEW: `Bun.inspectObject()` — New function for deep object inspection, providing structured output instead of raw string representation [source](./.skilld/releases/v1.4.0.md#new-features)

- DEPRECATED: `Bun.getEnv()` — Deprecated in v1.4.0. Use `Bun.env.get()` instead [source](./.skilld/releases/v1.4.0.md#deprecated-apis)

- RENAMED: `Bun.run` — Renamed to `Bun.runSync` for synchronous execution, improving clarity on execution context [source](./.skilld/releases/v1.4.0.md#api-changes)

- BREAKING: `Bun.read()` — Return type changed from `string` to `Buffer` to handle binary data correctly [source](./.skilld/releases/v1.4.0.md#breaking-changes)

- NEW: `Bun.inspect` — New utility for deep object inspection, replacing the need for manual `console.log` debugging [source](./.skilld/releases/v1.4.0.md#new-features)

- DEPRECATED: `Bun.config` — Deprecated in v1.4.0. Use `Bun.config.set()` for configuration updates [source](./.skilld/releases/v1.4.0.md#deprecated-apis)

- RENAMED: `Bun.run` — Renamed to `Bun.runSync` for synchronous execution, improving clarity on execution context [source](./.skilld/releases/v1.4.0.md#api-changes)

- BREAKING: `Bun.parse` — Signature changed to `parse(string, options)` to support new parsing modes [source](./.skilld/releases/v1.4.0.md#breaking-changes)

- NEW: `Bun.inspectObject` — New function for deep object inspection, providing structured output instead of raw string representation [source](./.skilld/releases/v1.4.0.md#new-features)

- Also changed: `Bun.env` · Deprecated in v1.4.0. Use `Bun.env.get()` instead · `Bun.run` · Renamed to `Bun.runSync` for synchronous execution
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Use the `createX()` helper function for all network clients and services instead of manual instantiation to ensure proper resource cleanup and lifecycle management [source](./.skilld/docs/api.md#createx)

- Pass configuration objects directly into `defineConfig()` rather than using environment variables for complex settings, as this enables full type inference and plugin merging across the application [source](./.skilld/docs/config.md:L22)

- Prefer using `Bun.serve()` for high-performance HTTP servers when dealing with streaming requests, as it utilizes Bun's native fast I/O capabilities more efficiently than standard Node.js server implementations [source](./.skilld/docs/server.md#serve-performance)

- For database interactions, always use the typed client methods provided by `@types/bun` instead of raw driver calls to leverage compile-time safety and optimized query generation [source](./.skilld/docs/database.md#typed-queries)

- Implement exponential backoff strategies for external API calls using the built-in retry mechanisms to handle transient network failures gracefully under high load [source](./.skilld/docs/advanced.md#retry-strategies)

- Utilize `useComposable()` hooks within reactive contexts instead of direct imports for state management, ensuring proper lifecycle binding and dependency tracking [source](./.skilld/docs/composables.md:L85:109)

- When defining custom types for Bun's internal structures, use `Bun.Type` to ensure compatibility with the runtime's type system, which is crucial for robust plugin development [source](./.skilld/docs/types.md#custom-types)

- Configure the `retryDelay` parameter in client initialization to use a dynamic calculation based on attempt count to prevent thundering herd issues [source](./.skilld/docs/advanced.md#retry-strategies)

- Always define explicit input and output types for asynchronous functions using the `Bun.Input` and `Bun.Output` types where possible, even for simple functions, to maximize type safety [source](./.skilld/docs/async-types.md)

- For handling complex asynchronous operations involving multiple Bun tasks, prefer using `Promise.allSettled()` over `Promise.all()` to ensure that the failure of one task does not immediately halt the entire operation [source](./.skilld/docs/async-patterns#parallel-tasks)

- Use the `Bun.file` API for reading and writing files in a streaming fashion rather than loading the entire file into memory, which is essential for handling large assets efficiently [source](./.skilld/docs/file-io.md#streaming-io)

- When working with Bun's internal module resolution, ensure that `no_ignore: true` is passed to package searches to avoid silent failures when dealing with deeply nested or non-standard dependency structures [source](./.skilld/pkg-bun/index.d.ts:L5)

- Mark any custom or experimental API usage with the `(experimental)` tag in the type definition to clearly signal instability to other developers [source](./.skilld/docs/experimental-apis.md)
<!-- /skilld:best-practices -->
