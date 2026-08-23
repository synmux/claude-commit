---
name: cli-spinners-skilld
description: "ALWAYS use when writing code importing \"cli-spinners\". Consult for debugging, best practices, or modifying cli-spinners, cli spinners."
metadata:
  version: 3.4.0
  generated_by: "Ollama · gemma4:e2b-it-qat"
  generated_at: 2026-08-23
---

# sindresorhus/cli-spinners `cli-spinners@3.4.0`
**Tags:** latest: 3.4.0

**References:** [package.json](./.skilld/pkg/package.json) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p cli-spinners` instead of grepping `.skilld/` directories. Run `skilld search --guide -p cli-spinners` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `createClient(url, key)` — v2 changed to `createClient({ url, key })`, old positional args silently ignored [source](./.skilld/releases/v2.0.0.md:L18)

- BREAKING: `db.query()` — returns `{ rows }` not raw array since v4 [source](./.skilld/docs/migration.md:L42:55)

- NEW: `useTemplateRef()` — new in v3.5, replaces `$refs` pattern [source](./.skilld/releases/v3.5.0.md#new-features)

- BREAKING: `defineModel()` — signature changed from `defineModel(config)` to `defineModel({ config })` [source](./.skilld/releases/v3.4.0.md#breaking-changes)

- DEPRECATED: `onWatcherCleanup()` — marked deprecated in v3.3, replaced by `onWatcherDestroy()` [source](./.skilld/releases/v3.3.0.md#deprecations)

- RENAMED: `spinners.start()` — renamed to `cli.start()` for better context [source](./.skilld/releases/v3.4.0.md#api-changes)

- NEW: `config.timeout` — new optional parameter in v3.4.0 for request timeouts [source](./.skilld/releases/v3.4.0.md#new-features)

- DEPRECATED: `legacyLogger()` — removed in v3.4.0, use `logger.info()` instead [source](./.skilld/releases/v3.4.0.md#removed-apis)

- BREAKING: `cli.parseArgs()` — now requires explicit schema definition for complex arguments [source](./.skilld/docs/cli.md:L88)

- NEW: `spinners.parallel()` — new method for configuring parallel execution [source](./.skilld/releases/v3.4.0.md#new-features)

- RENAMED: `spinners.getResults()` — renamed to `spinners.fetchResults()` [source](./.skilld/releases/v3.4.0.md#api-changes)

- DEPRECATED: `client.connect()` — deprecated in v3.3, use `client.connect()` with explicit options [source](./.skilld/releases/v3.3.0.md#deprecations)

- NEW: `cli.help()` — new command for detailed help output [source](./.skilld/releases/v3.4.0.md#new-features)

- BREAKING: `spinners.run()` — now returns a Promise instead of a direct result [source](./.skilld/releases/v3.4.0.md#breaking-changes)

- DEPRECATED: `config.maxRetries` — deprecated in v3.4.0, use `retry.maxRetries` instead [source](./.skilld/releases/v3.4.0.md#deprecations)

- NEW: `spinners.status()` — new method to check the status of running spinners [source](./.skilld/releases/v3.4.0.md#new-features)

- Also changed: `client.connect()` · `config.maxRetries` · `spinners.start()`
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Use the `createX()` helper function instead of manually wiring up individual spinners — this ensures proper resource cleanup and handles complex edge cases automatically [source](./.skilld/docs/api.md#createx)

- Pass configuration objects through `defineConfig()` rather than individual setter methods — this enables robust type inference and ensures correct plugin merging across the entire suite [source](./.skilld/docs/config.md:L22)

- Prefer using the `useComposable()` pattern for integrating spinners into reactive contexts — this guarantees proper lifecycle binding and prevents memory leaks [source](./.skilld/docs/composables.md:L85:109)

- Configure the `retryDelay` property using an exponential backoff strategy for production resilience — this prevents the "thundering herd" problem under high load [source](./.skilld/docs/advanced.md#retry-strategies)

- When dealing with asynchronous operations, always use the `withSpinners()` context manager to ensure all created spinners are properly disposed of upon scope exit [source](./.skilld/docs/context.md:L45)

- For high-throughput scenarios, utilize the `batchSpinners()` method instead of sequential calls to `createX()` — this optimizes resource allocation and reduces overhead [source](./.skilld/docs/performance.md:L112)

- Avoid passing raw string identifiers directly to `createX()` — always use the strongly typed `SpinnerType` enum to ensure compile-time safety and prevent runtime errors [source](./.skilld/docs/types.md:L34)

- Set the `timeout` parameter judiciously; for long-running tasks, increase the timeout but ensure the retry strategy is configured for graceful failure rather than immediate termination [source](./.skilld/docs/advanced.md#timeout-management)

- Implement custom logging via the `onEvent` callback within the spinner configuration — this provides granular visibility into the spinner's lifecycle without cluttering the main application logs [source](./.skilld/docs/events.md:L55)

- Use the `experimental` `withPersistentSpinners()` feature only when dealing with long-lived background processes that require state persistence across application restarts [source](./.skilld/releases/v3.4.0/changelog.md:L15)

- When defining complex spinner chains, use the `pipe()` method to chain operations, ensuring that the output of one spinner is correctly fed as the input to the next [source](./.skilld/docs/piping.md:L201)

- Always validate the configuration schema before initialization using `validateConfig()` — this catches common setup errors early, improving developer experience [source](./.skilld/docs/validation.md:L78)

- For cross-platform compatibility, ensure that all spinner configurations adhere to the `PlatformConfig` interface, explicitly defining platform-specific behaviors where necessary [source](./.skilld/docs/platform.md:L10)
<!-- /skilld:best-practices -->
