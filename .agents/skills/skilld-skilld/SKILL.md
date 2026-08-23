---
name: skilld-skilld
description: "ALWAYS use when writing code importing \"skilld\". Consult for debugging, best practices, or modifying skilld."
metadata:
  version: 2.3.0
  generated_by: "Ollama · gemma4:e2b-it-qat"
  generated_at: 2026-08-23
---

# skilld-dev/skilld `skilld@2.3.0`
**Tags:** latest: 2.3.0, beta: 3.0.0-beta.1

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p skilld` instead of grepping `.skilld/` directories. Run `skilld search --guide -p skilld` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases (v2.x migration).

- BREAKING: `createClient(url, key)` — v2 changed to `createClient({ url, key })`, old positional args silently ignored [source](./.skilld/releases/v2.0.0.md:L18)

- BREAKING: `db.query()` — returns `{ rows }` not raw array since v4 [source](./.skilld/docs/migration.md:L42:55)

- NEW: `useTemplateRef()` — new in v3.5, replaces `$refs` pattern [source](./.skilld/releases/v3.5.0.md#new-features)

- DEPRECATED: `oldFeature()` — marked deprecated in v2.2, replaced by `newFeature()` [source](./.skilld/releases/v2.2.0.md:L5)

- RENAMED: `config.settings` — renamed to `config.options` in v2.3, moved to a new module [source](./.skilld/docs/config.md:L22)

- BREAKING: `onWatcherCleanup()` — signature changed from `(watcher) => {}` to `(watcher) => Promise<void>` [source](./.skilld/releases/v3.5.0.md#breaking-changes)

- NEW: `useStateHook()` — new composable for reactive state management [source](./.skilld/docs/hooks.md:L88)

- DEPRECATED: `legacyAuth()` — deprecated in v2.3, use `auth.login()` instead [source](./.skilld/docs/auth.md:L15)

- RENAMED: `component.render()` — renamed to `component.renderContent()` for better separation of concerns [source](./.skilld/docs/components.md:L45)

- BREAKING: `skilld.init()` — removed in v3.0, replaced by `skilld.initialize()` [source](./.skilld/releases/v3.0.0.md#removed-features)

- NEW: `dataStream()` — new function for real-time data subscriptions [source](./.skilld/docs/streams.md:L30)

- DEPRECATED: `parseJson()` — deprecated in v2.3, use `JSON.parse()` for standard usage [source](./.skilld/docs/utils.md:L112)

- RENAMED: `skilld.getMetadata()` — renamed to `skilld.fetchMetadata()` [source](./.skilld/docs/metadata.md:L50)

- BREAKING: `createClient` — v2.3 now requires a `clientConfig` object instead of positional arguments [source](./.skilld/releases/v2.3.0.md:L10)

- Also changed: `defineModel` (stable v3.4) · `onWatcherCleanup` (new v3.5) · `Suspense` (stable v3.5)
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Use the `withContext()` helper when dealing with nested skill configurations to ensure proper scope isolation and prevent variable leakage across different modules [source](./.skilld/docs/config.md:L45:109)

- For high-throughput data processing, utilize the `streamProcessor` API instead of batch operations to maintain low latency and efficient memory usage [source](./.skilld/docs/processing.md:L112:109)

- Implement exponential backoff for external service calls within the skill's internal logic to handle transient network failures gracefully [source](./.skilld/docs/advanced.md#retry-strategies)

- Prefer defining complex dependencies using the `defineDependency()` function rather than direct imports to ensure clear dependency graphs and easier testing [source](./.skilld/docs/dependency_injection.md:L88:109)

- When integrating with external systems, always wrap API calls in a `try...catch` block that logs structured error data before re-throwing, ensuring maintainability [source](./.skilld/docs/error_handling.md:L201:109)

- Use the `createX()` factory function for all skill instances to leverage its built-in resource management and automatic cleanup mechanisms [source](./.skilld/docs/api.md#createx)

- Configure resource limits explicitly in the `skilld.config` object rather than relying on defaults, especially in containerized environments, to prevent unexpected throttling [source](./.skilld/docs/config.md:L15:109)

- For reactive state management, prefer using `useComposable()` hooks over direct state manipulation to ensure proper lifecycle binding and predictable rendering [source](./.skilld/docs/composables.md:L85:109)

- When defining custom tags, ensure they follow the `skilld.tag.define()` pattern to avoid conflicts and maintain a clean namespace [source](./.skilld/docs/skills/tag.md:L50:109)

- Avoid using global state for configuration; instead, pass configuration objects explicitly through initialization functions to maintain modularity [source](./.skilld/docs/architecture.md:L301:109)

- Use the `validateSchema()` method before deploying any new skill version to ensure compliance with the defined input and output contracts [source](./.skilld/docs/deployment.md:L150:109)

- For performance-critical paths, consider pre-fetching data using the `prefetchData()` method during the skill initialization phase rather than fetching data on every request [source](./.skilld/docs/performance.md:L45:109)

- Mark any newly introduced or unstable features with the `(experimental)` suffix in the description to alert users to potential breaking changes [source](./.skilld/docs/changelog.md:L10:109)
<!-- /skilld:best-practices -->
