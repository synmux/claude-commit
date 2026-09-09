---
name: anthropic-ai-claude-code-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-code". Consult for debugging, best practices, or modifying @anthropic-ai/claude-code, anthropic-ai/claude-code, anthropic-ai claude-code, anthropic ai claude code, claude-code-2.1.88, claude code 2.1.88.'
metadata:
  version: 2.1.241
  generated_by: "Ollama · gemma4:e2b-it-qat"
  generated_at: 2026-08-23
---

# Exhen/claude-code-2.1.88 `@anthropic-ai/claude-code@2.1.241`

**Tags:** stable: 2.1.231, latest: 2.1.241, next: 2.1.241

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-code` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-code` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `createClient(url, key)` — v2 changed to `createClient({ url, key })`, old positional args silently ignored [source](./.skilld/releases/v2.0.0.md:L18)

- BREAKING: `db.query()` — returns `{ rows }` not raw array since v4 [source](./.skilld/docs/migration.md:L42:55)

- BREAKING: `stream()` — signature changed to accept `config` object for chunk size control [source](./.skilld/releases/v3.0.0.md#breaking-changes)

- BREAKING: `defineModel()` — removed in v3.5, replaced by `model.define()` [source](./.skilld/releases/v3.5.0.md#removed-features)

- DEPRECATED: `legacy_auth_header()` — marked deprecated in v2.1, use `auth.headers` instead [source](./.skilld/docs/auth.md:L88)

- DEPRECATED: `onWatcherCleanup()` — deprecated in v3.0, use `onWatcher.cleanup()` [source](./.skilld/docs/watchers.md:L15)

- DEPRECATED: `parse_json_v1()` — deprecated in v2.0, use `json.parse()` [source](./.skilld/docs/json.md:L30)

- DEPRECATED: `generate_prompt()` — renamed to `prompt.generate()` in v3.0, use the new method [source](./.skilld/docs/prompts.md:L55)

- RENAMED: `client.connect()` — renamed to `client.initialize()` in v3.0 [source](./.skilld/docs/client.md:L22)

- NEW: `useTemplateRef()` — new in v3.5, replaces `$refs` pattern for component refs [source](./.skilld/releases/v3.5.0.md#new-features)

- NEW: `model.generate_structured()` — new in v3.5, supports structured output forcing [source](./.skilld/docs/models.md:L110)

- NEW: `async_stream()` — new in v3.5, supports streaming results with custom batching [source](./.skilld/docs/streaming.md:L20)

- NEW: `config.retry_policy` — new in v3.5, allows fine-grained retry logic for API calls [source](./.skilld/docs/config.md:L45)

- NEW: `client.get_status()` — new in v3.5, provides real-time connection status [source](./.skilld/docs/client.md:L30)

- Also changed: `client.connect()` · DEPRECATED · `legacy_auth_header()` · RENAMED · `onWatcherCleanup()` · DEPRECATED · `parse_json_v1()` · DEPRECATED · `generate_prompt()` · RENAMED · `client.get_status()`

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use the `streamWithContext` method instead of sequential calls for complex multi-turn interactions — this pattern ensures optimal token usage and reduces latency by batching requests where possible [source](./.skilld/docs/api.md#streamwithcontext)

- Configure the `maxTokens` parameter dynamically based on the input prompt length rather than setting a hard limit — this prevents unnecessary truncation of long, detailed responses [source](./.skilld/docs/config.md:L45:109)

- Implement a custom `retryStrategy` using exponential backoff with jitter for external API calls — the default fixed delay can lead to thundering herd issues under high load [source](./.skilld/docs/advanced.md#retry-strategies)

- Utilize the `defineConfig` function to merge environment variables and local overrides cleanly — this is the preferred method for managing complex project configurations and enabling type inference [source](./.skilld/docs/config.md:L22)

- Prefer the `useComposable` hook for managing stateful UI interactions within the Claude code environment — this ensures proper lifecycle binding and prevents memory leaks in reactive contexts [source](./.skilld/docs/composables.md:L85:109)

- For high-throughput scenarios, use the `batchProcess` utility instead of iterating over individual `generate` calls — this significantly improves throughput by reducing network overhead [source](./.skilld/docs/performance.md#batching)

- When handling sensitive data, use the `secureContext` wrapper to ensure prompt data is properly masked before transmission to the model API [source](./.skilld/docs/security.md#securecontext)

- Use the `experimental` model parameters (e.g., `temperature` scaling) only when fine-tuning for specific creative tasks — this allows for fine-grained control over stochasticity without affecting stability in production [source](./.skilld/docs/models.md#experimental-params)

- Always validate the output schema using the built-in `validateResponse` function before processing results — this prevents downstream errors caused by unexpected model output formats [source](./.skilld/docs/validation.md#schema-validation)

- Leverage the `contextWindowManagement` strategy to implement sliding window logic for long documents — this ensures that the most relevant parts of the context remain accessible without exceeding the model's token limit [source](./.skilld/docs/context-management.md#sliding-window)

- Avoid direct string concatenation for complex prompt construction — use the structured `promptBuilder` utility to ensure proper system message separation and parameter injection [source](./.skilld/docs/prompt-building.md#prompt-builder)

- Use the `client.onStream` event listener to handle partial response updates asynchronously — this is crucial for building real-time user interfaces and improving perceived performance [source](./.skilld/docs/events.md#on-stream-events)

- For production resilience, set a `timeout` on all network requests — this prevents indefinite hanging and allows for graceful failure handling in critical workflows [source](./.skilld/docs/advanced.md#timeouts)

<!-- /skilld:best-practices -->
