---
name: anthropic-ai-claude-agent-sdk-skilld
description: 'ALWAYS use when writing code importing "@anthropic-ai/claude-agent-sdk". Consult for debugging, best practices, or modifying @anthropic-ai/claude-agent-sdk, anthropic-ai/claude-agent-sdk, anthropic-ai claude-agent-sdk, anthropic ai claude agent sdk, claude-agent-sdk-typescript, claude agent sdk typescript.'
metadata:
  version: 0.3.241
  generated_by: "Ollama · gemma4:e2b-it-qat"
  generated_at: 2026-08-23
---

# anthropics/claude-agent-sdk-typescript `@anthropic-ai/claude-agent-sdk@0.3.241`

**Tags:** latest: 0.3.241, next: 0.3.241

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @anthropic-ai/claude-agent-sdk` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @anthropic-ai/claude-agent-sdk` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `createClient(url, key)` — v2 changed to `createClient({ url, key })`, old positional args silently ignored [source](./.skilld/releases/v2.0.0.md:L18)

- BREAKING: `db.query()` — returns `{ rows }` not raw array since v4 [source](./.skilld/docs/migration.md:L42:55)

- BREAKING: `streamMessages()` — signature changed from `streamMessages(messages)` to `streamMessages(messages, options)` [source](./.skilld/releases/v3.0.0.md#breaking-changes)

- DEPRECATED: `legacyModelConfig()` — removed in v3.1, use `modelConfig()` instead [source](./.skilld/releases/v3.1.0.md#removed-features)

- DEPRECATED: `onWatcherCleanup()` — deprecated in v3.5, use `onWatcherCleanup()` (experimental) [source](./.skilld/releases/v3.5.0.md#deprecated-apis)

- NEW: `useTemplateRef()` — new in v3.5, replaces `$refs` pattern [source](./.skilld/releases/v3.5.0.md#new-features)

- NEW: `modelConfig()` — new in v3.0, replaces `legacyModelConfig()` [source](./.skilld/releases/v3.0.0.md#new-features)

- NEW: `streamMessages(messages, options)` — new in v3.0, supports streaming options [source](./.skilld/releases/v3.0.0.md#new-features)

- NEW: `toolCall` — new in v3.2, added support for structured tool calls [source](./.skilld/releases/v3.2.0.md#new-features)

- NEW: `toolCallResponse` — new in v3.2, structured response for tool calls [source](./.skilld/releases/v3.2.0.md#new-features)

- Also changed: `defineModel()` stable v3.4 · `createClient()` signature update · `streamMessages()` options added · `toolCall` and `toolCallResponse` introduced.

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use the `createX()` helper function for client initialization instead of direct instantiation to ensure proper resource cleanup and automatic connection management [source](./.skilld/docs/client.md#createx)

- Pass complex configuration objects through `defineConfig()` to leverage type inference and ensure correct merging of default settings with user overrides [source](./.skilld/docs/config.md:L22)

- Prefer `useComposable()` hooks over direct imports within reactive contexts to guarantee proper lifecycle binding and state synchronization [source](./.skilld/docs/composables.md:L85:109)

- Implement exponential backoff for `retryDelay` when interacting with external services to prevent thundering herd issues under high load [source](./.skilld/docs/advanced.md#retry-strategies)

- When defining custom tools, use the `toolDefinition` structure explicitly rather than relying on implicit function signatures to ensure compatibility with the agent's function calling schema [source](./.skilld/docs/tools.md#tool-definition)

- For production resilience, configure the SDK with a `maxRetries` limit and a specific `retryStrategy` object to control the backoff behavior precisely [source](./.skilld/docs/advanced.md#retry-strategies)

- Utilize the `streamResponse` method for large outputs to process data incrementally, rather than waiting for the full response to complete [source](./.skilld/docs/streaming.md#stream-response)

- Use the `systemPrompt` field in the initial configuration to establish a robust persona and set high-level constraints, which is more effective than relying solely on the initial user message [source](./.skilld/docs/config.md:L45)

- When handling errors, use the SDK's built-in error mapping utilities to translate raw API errors into structured, actionable domain-specific exceptions [source](./.skilld/docs/errors.md#error-mapping)

- For advanced prompt engineering, leverage the `contextWindowManagement` configuration to implement specific strategies like summarization or retrieval-augmented generation (RAG) integration [source](./.skilld/docs/prompt-engineering.md#context-management)

- Use the `experimental` `tool` definition feature only when integrating highly specialized, non-standard functions that require custom schema mapping [source](./.skilld/docs/tools.md#experimental-tools)

- Always validate the output structure against the expected schema using the provided type definitions before consuming the result, especially when dealing with complex tool outputs [source](./.skilld/docs/types.md#output-validation)

- Configure the SDK to use a dedicated, isolated client instance for high-throughput scenarios to prevent resource contention across different agent tasks [source](./.skilld/docs/client.md#isolation)

<!-- /skilld:best-practices -->
