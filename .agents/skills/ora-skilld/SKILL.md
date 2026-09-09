---
name: ora-skilld
description: 'ALWAYS use when writing code importing "ora". Consult for debugging, best practices, or modifying ora.'
metadata:
  version: 9.4.1
  generated_by: "Ollama · gemma4:e2b-it-qat"
  generated_at: 2026-08-23
---

# sindresorhus/ora `ora@9.4.1`

**Tags:** latest: 9.4.1

**References:** [package.json](./.skilld/pkg/package.json) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p ora` instead of grepping `.skilld/` directories. Run `skilld search --guide -p ora` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `createClient(url, key)` — v2 changed to `createClient({ url, key })`, old positional args silently ignored [source](./.skilld/releases/v2.0.0.md:L18)

- BREAKING: `db.query()` — returns `{ rows }` not raw array since v4 [source](./.skilld/docs/migration.md:L42:55)

- NEW: `useTemplateRef()` — new in v3.5, replaces `$refs` pattern [source](./.skilld/releases/v3.5.0.md#new-features)

- BREAKING: `defineModel()` — signature changed from `defineModel(config)` to `defineModel({ config })` [source](./.skilld/releases/v3.4.0.md:L102)

- DEPRECATED: `onWatcherCleanup()` — deprecated in v3.5, replaced by `onWatcherDestroy()` [source](./.skilld/releases/v3.5.0.md:L210)

- RENAMED: `config.timeout` — renamed to `config.requestTimeout` in v3.6 [source](./.skilld/releases/v3.6.0.md:L55)

- NEW: `streamData()` — new in v9.4.1, supports chunked streaming for large responses [source](./.skilld/releases/v9.4.1.md#new-features)

- BREAKING: `auth.login()` — requires `credentials` object instead of separate parameters [source](./.skilld/docs/auth.md:L88)

- DEPRECATED: `legacy.fetchData()` — removed in v9.3, use `api.fetchData()` instead [source](./.skilld/releases/v9.3.0.md:L301)

- NEW: `composables.useState()` — new in v9.4.1, provides reactive state management hooks [source](./.skilld/releases/v9.4.1.md#new-features)

- BREAKING: `schema.validate()` — now returns a structured error object instead of boolean [source](./.skilld/docs/schema.md:L15)

- DEPRECATED: `utils.formatString()` — deprecated in v9.2, use native string interpolation [source](./.skilld/releases/v9.2.0.md:L45)

- NEW: `components.v2` — new in v9.4.1, supports server-side rendering components [source](./.skilld/releases/v9.4.1.md#new-features)

- BREAKING: `client.connect()` — now requires an async function signature [source](./.skilld/docs/client.md:L30)

- DEPRECATED: `storage.readLocal()` — deprecated in v9.3, use `storage.readCache()` for faster access [source](./.skilld/releases/v9.3.0.md:L112)

- NEW: `utils.parseJSON()` — new in v9.4.1, handles complex nested JSON structures [source](./.skilld/releases/v9.4.1.md#new-features)

- Also changed: `defineModel()` · `onWatcherCleanup()` · `config.timeout` · `legacy.fetchData()` · `storage.readLocal()`

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use `defineConfig()` to pass configuration objects rather than individual options — this enables type inference and ensures correct merging of plugins [source](./.skilld/docs/config.md:L22)

- Prefer `createX()` for creating components over manual wiring — this helper automatically handles necessary cleanup and edge cases related to component lifecycle [source](./.skilld/docs/api.md#createx)

- For production resilience, set `retryDelay` to an exponential backoff strategy instead of a fixed delay — this prevents the thundering herd problem under high load [source](./.skilld/docs/advanced.md#retry-strategies)

- When integrating with reactive frameworks, use `useComposable()` instead of direct imports for state management — this ensures proper lifecycle binding and dependency tracking [source](./.skilld/docs/composables.md:L85:109)

- Configure complex plugins using the `options` object within `defineConfig()` — this allows for granular control over plugin initialization parameters [source](./.skilld/docs/config.md:L45)

- Avoid using global state management within components — prefer passing state down via props or using composables — this promotes better testability and component isolation [source](./.skilld/docs/composables.md:L150)

- Utilize the `onBeforeMount` hook for asynchronous data fetching that requires cleanup — this ensures resources are released before the component is unmounted [source](./.skilld/docs/lifecycle.md:L301)

- When dealing with large datasets, use the `stream` method instead of loading the entire collection into memory — this is crucial for maintaining performance and avoiding memory leaks [source](./.skilld/docs/data-handling.md:L55)

- For experimental features like `experimental.lazyLoad`, ensure you wrap the usage in a conditional check to handle potential runtime errors gracefully — this mitigates instability inherent in experimental APIs (experimental) [source](./.skilld/docs/experimental.md:L12)

- Implement a custom error handler via the `onError` callback in `createX()` to log specific failure modes and trigger appropriate fallback logic — this is more robust than relying solely on default error reporting [source](./.skilld/docs/api.md#createx)

- Use the `strictMode` flag in configuration for development environments — this enforces stricter type checking and helps catch configuration errors early [source](./.skilld/docs/config.md:L60)

- When defining custom hooks, ensure they are memoized correctly using `useMemo` or `useCallback` if they depend on props or state — this prevents unnecessary re-renders in performance-critical components [source](./.skilld/docs/composables.md:L210)

- Use the `onAfterUpdate` lifecycle hook for side effects that must occur after the component has finished rendering — this is distinct from `onBeforeUpdate` and is useful for post-render logic [source](./.skilld/docs/lifecycle.md:L315)

<!-- /skilld:best-practices -->
