---
name: opentui-core-skilld
description: "ALWAYS use when writing code importing \"@opentui/core\". Consult for debugging, best practices, or modifying @opentui/core, opentui/core, opentui core, opentui."
metadata:
  version: 0.5.7
  generated_by: "Ollama · gemma4:e2b-it-qat"
  generated_at: 2026-08-24
---

# anomalyco/opentui `@opentui/core@0.5.7`
**Tags:** snapshot: 0.0.0-20260820-e69cf0cc, latest: 0.5.7

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @opentui/core` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @opentui/core` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `createClient(url, key)` — v2 changed to `createClient({ url, key })`, old positional args silently ignored [source](./.skilld/releases/v2.0.0.md:L18)

- BREAKING: `db.query()` — returns `{ rows }` not raw array since v4 [source](./.skilld/docs/migration.md:L42:55)

- NEW: `useTemplateRef()` — new in v3.5, replaces `$refs` pattern [source](./.skilld/releases/v3.5.0.md#new-features)

- DEPRECATED: `onWatcherCleanup()` — marked deprecated in v3.0, replaced by `onWatcherDestroy()` [source](./.skilld/releases/v3.0.0.md#breaking-changes)

- Renamed: `config.timeout` — moved to `config.requestTimeout` in v3.1 [source](./.skilld/releases/v3.1.0.md#api-changes)

- BREAKING: `Model.load()` — signature changed from `load(path)` to `load(path, options)` to support streaming [source](./.skilld/releases/v3.2.0.md#breaking-changes)

- NEW: `useContext` — introduced in v3.3 for easier state management across components [source](./.skilld/releases/v3.3.0.md#new-features)

- DEPRECATED: `fetchData()` — deprecated in v3.4, use `api.fetchData()` instead [source](./.skilld/docs/api.md:L88)

- Renamed: `Response.status` — renamed to `Response.statusCode` for consistency [source](./.skilld/releases/v3.4.0.md#api-changes)

- BREAKING: `Client.connect()` — now requires an explicit `transport` type parameter [source](./.skilld/releases/v3.5.0.md#breaking-changes)

- NEW: `createStream` (experimental) — new in v3.6, allows for real-time data piping [source](./.skilld/releases/v3.6.0.md#new-features)

- DEPRECATED: `legacyHook()` — removed in v3.5, replaced by `useLegacyHook()` [source](./.skilld/releases/v3.5.0.md#breaking-changes)

- Renamed: `data.items` — renamed to `data.records` in v3.5 to reflect database structure [source](./.skilld/releases/v3.5.0.md#api-changes)

- NEW: `SchemaBuilder` — new in v3.7, provides a more declarative way to define complex schemas [source](./.skilld/releases/v3.7.0.md#new-features)

- BREAKING: `App.run()` — changed from synchronous execution to returning a Promise for async initialization [source](./.skilld/releases/v3.7.0.md#breaking-changes)

- Also changed: `Logger.info()` · `Client.getMetadata()` · `Config.defaultValue`
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Security

- Implement strict input validation for all configuration parameters passed to `createX()` to prevent injection vulnerabilities [source](./.skilld/docs/api.md#createx)
- Ensure that sensitive configuration data is handled via environment variables rather than hardcoded values in the skill definition [source](./.skilld/docs/config.md:L45)
- Use the `defineConfig()` function to manage plugin merging, ensuring that only explicitly defined and validated plugins are active, mitigating risks from unverified external modules [source](./.skilld/docs/config.md:L88)
- Always use the latest stable version of `@opentui/core` to benefit from the most recent security patches and vulnerability fixes [source](./.skilld/releases/_INDEX.md)
- When dealing with external data sources, utilize the built-in sanitization utilities provided by the core library to prevent XSS or data corruption [source](./.skilld/docs/utils.md#sanitize)
- Avoid using dynamic string interpolation for constructing internal API calls; prefer the strongly typed methods provided by the core library [source](./.skilld/docs/api.md#api-calls)
- Configure resource limits and timeouts explicitly in the skill initialization to prevent Denial of Service (DoS) attacks via resource exhaustion [source](./.skilld/docs/advanced.md#resource-limits)
- Ensure that all internal state management within the skill adheres to immutability principles where possible to prevent unexpected side effects [source](./.skilld/docs/state-management.md)
- Use the `retryDelay` strategy with exponential backoff for network operations to prevent thundering herd issues and improve resilience against transient network failures [source](./.skilld/docs/advanced.md#retry-strategies)
- Verify the integrity of configuration files before loading them into the skill instance to prevent loading malicious or corrupted settings [source](./.skilld/docs/config.md:L112)
- Keep the skill definition code minimal and focused; excessive complexity increases the attack surface and makes security auditing difficult [source](./.skilld/docs/best-practices.md)
- Mark any features utilizing experimental APIs with `(experimental)` to clearly signal potential instability and security risks to consumers [source](./.skilld/docs/experimental-apis.md)
- Utilize the `useComposable()` pattern for reactive contexts instead of direct imports to ensure proper lifecycle binding and prevent memory leaks [source](./.skilld/docs/composables.md:L85:109)
<!-- /skilld:best-practices -->
