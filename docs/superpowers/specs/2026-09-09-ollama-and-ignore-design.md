# Design: `ollama:` models and the `ignore` directive

**Date:** 2026-09-09
**Status:** Implemented

Two independent changes shipped together.

## Part 1: Ollama models

### Part 1: Problem

Every model call goes through the Claude Agent SDK, which spawns the bundled
`claude` binary. That binds cco to Claude models and to a Claude subscription.
Summarising a diff is a dull, high-volume, low-stakes job - exactly the kind
of work a local model can do for free - and the diff is the most sensitive
thing cco touches, so keeping it on the machine has value beyond cost.

### Part 1: Decision

A model string may carry an `ollama:` prefix. Everything after the prefix is
the Ollama model name **verbatim**, tags and all, so
`"ollama:ornith-1.5:35b"` means the model `ornith-1.5:35b`. The prefix is
matched case-insensitively; the model name is not.

The two stages are independent, so a mixed setup is the natural one:

```json
{ "models": { "summary": "ollama:ornith-1.5:35b", "final": "sonnet" } }
```

The prefix works anywhere a model name does, including `--model-summary` /
`--model-final`.

### API surface: native, not a compatibility layer

Ollama exposes three dialects. cco uses the **native** `/api/chat`:

- The OpenAI layer (`/v1/chat/completions`) offers no way to set the context
  length. cco sizes diff chunks against the context window, so a dialect
  that cannot state or set one is unusable here.
- The Anthropic layer (`/v1/messages`) exists to let Anthropic SDK clients
  point at Ollama. cco does not talk raw Anthropic - it talks Agent SDK,
  which spawns a binary that does its own auth - so there is nothing to
  reuse, and the layer drops `tool_choice` and token counting anyway.
- The native API gives `options.num_ctx`, structured output via `format`,
  `keep_alive`, and the usage counts that make prompt truncation detectable.

No SDK dependency: one `fetch` to one endpoint, so cco stays runtime-neutral.

### Provider dispatch

`src/models.ts` owns `parseModelRef` and the `runPrompt` dispatcher.
`src/agent.ts` keeps the Claude path (renamed `runClaudePrompt`) and
`src/ollama.ts` holds the Ollama path. `generate.ts` keeps calling a single
`runPrompt`, so the injectable-runner seam the tests use is unchanged.

### Context length is the whole ballgame

Ollama's default context is VRAM-dependent (4k/32k/256k tiers) and a prompt
that exceeds it is **silently truncated** - HTTP 200, no flag, oldest content
dropped. A summary of a diff whose second half was thrown away is worse than
an error, so cco:

1. Sends an explicit `options.num_ctx` on every request, from
   `ollama.context`. Never leaves the window implicit.
2. Sizes chunks against that same number, via `clampChunkTokens`.
3. Checks `prompt_eval_count` on the response. At or above `num_ctx` the
   prompt was truncated, and cco raises an error whose text says "prompt is
   too long" - the phrase `isPromptTooLongError` matches - so the existing
   halve-and-re-split retry handles it exactly as it handles a Claude
   overflow. Ollama has no such rejection of its own; this synthesises one.
4. Treats `done_reason: "length"` as an error: the _reply_ was cut off.

`CONTEXT_RESERVE_TOKENS` (32k) is larger than a whole 32k Ollama window, so
the reserve became proportional: `min(32_000, window / 4)`. Every Claude
window (200k and 1M) reserves 32k exactly as before.

### Where the window comes from: `"auto"`

The first cut pinned a hardcoded 32768. That is the middle VRAM tier and
safe everywhere, and on the machine this was built on it lowballed a Gemma
model by 4x - the server would happily have run it at 131072.

`ollama.context` therefore defaults to `"auto"`, which asks the server
rather than guessing. Two calls, once per model per run, before any chunk
is sized: a `/api/chat` with empty `messages` and **no `num_ctx`** preloads
the model and lets the server apply its own VRAM-tier choice; `/api/ps` then
reports the `context_length` the loaded model is actually running with.
That number is pinned as `num_ctx` on every real request (so it matches
what is resident and causes no reload) and used for chunk sizing and the
truncation check. The load was going to happen on the first real request
anyway; the added cost is one `ps` round trip.

Verified against Ollama 0.33.3: the tier is capped at the model's trained
maximum (`gemma4:e2b-it-qat` reports 131072 in both `/api/show` and
`/api/ps` on a machine in the top tier). A number in config pins the window
and skips the probe; a probe that cannot find the model in `ps`, or finds
it without a `context_length`, fails the run before any model call with a
message naming the key to pin.

`OllamaContextResolver` in `generate.ts` memoises the answer per model so
the summary and final stages share one probe when they share a model, and
hands the runner a config with the number substituted in - `runOllamaPrompt`
still accepts `"auto"` for direct library use, at the cost of a probe per
call.

### Cost, structure, streaming

- `costUsd` is always `0`: local inference is not billed. `--verbose` totals
  stay meaningful for a mixed run - only the Claude calls contribute.
- Structured output maps to `format: <schema>`; the model returns JSON as the
  message content, which cco parses into `ModelResult.structured`. A model or
  server that cannot honour it produces unparseable content, `structured`
  stays unset, and `generate.ts`'s existing attempt chain falls through to
  plain text. Ollama Cloud does not support `format` at all - same path.
- `temperature` goes in `options`, not at the top level.
- Streaming is used only when a caller passes `onText`; everything else is
  `stream: false`. NDJSON lines are parsed individually because an error can
  arrive as a line _after_ HTTP 200 has been sent.
- `think` is never sent (models differ on whether it can even be switched
  off) and any `message.thinking` that comes back is discarded.

### Config

```json
{
  "ollama": {
    "host": "http://localhost:11434",
    "context": "auto",
    "keepAlive": null
  }
}
```

`host` defaults to `$OLLAMA_HOST`, then `http://localhost:11434`; a bare
`host:port` (Ollama's own convention) gains an `http://`. `context` is
`"auto"` or a token count (raw integers only - `"256k"`-style suffixes were
considered and declined as not worth a parser). `keepAlive` is passed
through untouched when set, including on the probe's preload so it does not
evict the model early.

The `allowApiKey` credential gate is Claude-only and untouched: Ollama is
reached over plain HTTP with no credential, and `ANTHROPIC_*` never leaves
the Claude path.

### Rejected

- **An Ollama SDK dependency.** One endpoint, one `fetch`. The JS SDK also
  needs `node:fs` unless you import the browser build.
- **Auto-pulling a missing model.** A 404 says how to pull it and stops.
  Downloading tens of gigabytes is not a commit-message tool's decision.
- **Probing `/api/show` for the model's context length.** It reports the
  model's _maximum_, which is frequently far more than the machine can hold
  (131072 on a laptop), so it is the wrong number to size against - and it
  costs a round trip on every run.

## Part 2: `ignore`

### Part 2: Problem

`lowPriorityPaths` deprioritises churn; it still reads and pays for all of
it. Some content is worth neither: a vendored dependency tree, a generated
API client, a data fixture that changes wholesale. Reading it costs tokens
and time and cannot improve the message.

### Part 2: Decision

`ignore: string[]` (default `[]`) takes the same gitignore-style patterns as
`lowPriorityPaths`. Matching file sections are removed from the diff before
anything else looks at it - before the low-priority partition, before
chunking, before any model call.

The pipeline stages compose in the order their names suggest:

```text
diff ─ ignore ─▶ ─ skipArmored ─▶ ─ lowPriorityPaths ─▶ chunks ─▶ summaries
```

Section-matching follows the `lowPriorityPaths` rule exactly: a section is
ignored only when it names at least one path and **every** path it names
matches, so a rename out of an ignored directory is still described.

**Ignored files are still committed.** `ignore` governs what the model
reads, never what git stages. A commit whose every file is ignored is a
commit the model has nothing to describe, so cco stops with an error naming
the directive rather than inventing a message - unlike `lowPriorityPaths`,
which promotes its partition in that case. The two behaviours differ because
the options mean different things: "this matters less" degrades gracefully,
"do not look at this" has nothing to degrade to.

`--no-ignore` disables the directive for one run, in the shape of
`--no-low-priority-paths`. `--verbose` reports the match count.

### Shared matching

`src/paths.ts` served one option and was named for it
(`createLowPriorityMatcher` / `isLowPriorityPath`). It now serves two, so
the names became `createPathMatcher` / `matchesPathPatterns`. The semantics
are unchanged.
