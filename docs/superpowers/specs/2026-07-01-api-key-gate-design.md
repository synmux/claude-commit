# Design: `allowApiKey` configuration gate

**Date:** 2026-07-01
**Status:** Approved

## Problem

`claude-commit` calls Claude through the Claude Agent SDK, which spawns the
bundled `claude` binary and inherits `process.env`. Authentication therefore
follows Claude Code's resolution order: with `ANTHROPIC_API_KEY` (or
`ANTHROPIC_AUTH_TOKEN`) present in the environment, that credential is used and
every generation is billed pay-as-you-go — silently. A stray `export` in a
shell profile flips billing away from the user's Claude subscription with no
indication. This is dangerous.

## Decision

API-credential usage becomes **opt-in via configuration**. A new boolean config
option `allowApiKey` (default `false`) gates whether the credential environment
variables are passed through to the SDK subprocess.

- **Gate off (default):** `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are
  removed from the environment handed to the spawned `claude` binary, so
  subscription auth (`claude login`) is always used. If either variable was
  present, a one-line notice is printed to stderr once per run explaining why
  it is being ignored and how to enable it.
- **Gate on (`allowApiKey: true`):** the environment passes through untouched
  and the credential is used, exactly as before.

Both variables are stripped whenever they are _present_ (even empty), since
presence alone perturbs the SDK's credential resolution.

## Approaches considered

1. **Env-strip in the subprocess environment** (chosen) — the gate controls
   which credentials the subprocess can see at all. Structurally fail-safe;
   robust to future SDK auth-resolution changes; single enforcement point.
2. Call-site `if` guard around `runPrompt` — rejected: duplicates per call
   site and leaves the credential in place, so any new code path re-opens the
   hole.
3. External wrapper (shell alias / env file) — rejected: not enforceable from
   within the project, poor UX.

## Detailed design

### Config surface

- `Config` / `PartialConfig` (`src/types.ts`): new `allowApiKey: boolean`.
- `DEFAULT_CONFIG` (`src/config.ts`): `allowApiKey: false`.
- `sanitizePartial` (`src/config.ts`): accept boolean `allowApiKey`.
- Settable through the existing precedence chain:
  `package.json#claude-commit` < `.claude-commit(.rc).json` < CLI flags.
  No new CLI flag (YAGNI — a deliberate, set-once safety setting).

### Enforcement (`src/agent.ts`)

- Replace `envWithTemperature` with a pure, exported
  `buildSubprocessEnv({ baseEnv, allowApiKey, temperature })` returning the
  env record for the SDK subprocess (or `undefined` when the parent env can be
  inherited unchanged). Responsibilities:
  - delete `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` when `allowApiKey` is
    false and they are present;
  - fold in the `CLAUDE_CODE_EXTRA_BODY` temperature override (preserving any
    existing extra body), as today.
- `RunPromptOptions` gains `allowApiKey?: boolean`, **defaulting to `false` at
  this layer too** — the fail-safe holds even if a future caller forgets it.
- `src/generate.ts` passes `config.allowApiKey` at both `runPrompt` call
  sites.
- `describeAssistantError`'s authentication case additionally mentions that
  using an API key requires `allowApiKey: true` in the config.

### Notice (`src/cli.ts`)

Once per run, after config resolution: if the gate is off and either variable
is present, print a dim stderr one-liner, e.g.

> Ignoring ANTHROPIC_API_KEY (using subscription auth; set
> `"allowApiKey": true` in your claude-commit config to use it).

The strip is the guarantee; the notice is discoverability.

### Documentation

- README authentication section: key present → **ignored unless**
  `allowApiKey: true`.
- `--help` authentication text in `src/cli.ts`.
- `WALKTHROUGH.md` if it describes auth behaviour.

### Testing (`bun test`)

- `test/config.test.ts`: `allowApiKey` sanitisation (boolean kept, wrong type
  ignored), default `false`, precedence through `resolveConfig`.
- `test/agent.test.ts` (new): `buildSubprocessEnv` — strips both variables
  when the gate is off; preserves them when on; leaves unrelated variables
  intact; temperature merge still respects an existing
  `CLAUDE_CODE_EXTRA_BODY`; inherits (returns `undefined`) when there is
  nothing to change.

## Error handling

No new failure modes. A user whose key is stripped and who has no
`claude login` session hits the existing authentication error, now with
gate-aware wording.

## Compatibility

**Breaking change (intentional):** users who currently rely on an exported
`ANTHROPIC_API_KEY` must add `allowApiKey: true` to their configuration. No
migration shim.
