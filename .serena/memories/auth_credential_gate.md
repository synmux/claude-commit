# API credential gate (`allowApiKey`)

Since commit 2d11c56 (2026-07-01), API credential usage is opt-in:

- Config option `allowApiKey: boolean`, default **false** (`DEFAULT_CONFIG`, `Config` in src/types.ts).
- Gate off → `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are **stripped** from the env passed to the Agent SDK subprocess (`buildSubprocessEnv` in src/agent.ts; `GATED_CREDENTIAL_VARS`), forcing `claude login` subscription auth. A dim stderr notice prints once per run (src/cli.ts, after `resolveConfig`).
- Gate on → credentials pass through (pay-as-you-go).
- Fail-safe at two layers: config default false AND `allowApiKey` defaults false inside `buildSubprocessEnv`/`RunPromptOptions` when omitted.
- `presentCredentialVars(env)` is the shared presence check (empty string counts as present).
- Design spec: `docs/superpowers/specs/2026-07-01-api-key-gate-design.md`.
- Verified end-to-end by differential run: bogus key + gate off → success via subscription; gate on → "Invalid API key" error.

Known gap: an invalid external key with the gate on surfaces the raw CLI error string ("Invalid API key · Fix external API key") via the generic result-error path, not the friendlier `describeAssistantError` auth message (that only fires for assistant-level `authentication_failed` codes).
