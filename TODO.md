# TODO

Open work, most useful first. Finished and rejected work is recorded in
`docs/superpowers/specs/` - the TypeSafe items below build on
`2026-10-19-typesafe-candidate-check-design.md`, which holds the test
methods and numbers they refer to. The bugs from the 2026-10-20 review
(items 1a-1h) are fixed; see CHANGELOG.md under "Unreleased - Fixed".

## 1. Cap Ollama chunk size

### Problem

On Ollama, the limit that matters is how long one request takes, not the
context window. Node's fetch abandons a request that sends nothing for
300 s, and a summary request sends nothing until the summary is written.
cco sizes chunks from the window, which can be huge:

- `"ollama.context": "auto"` let Ollama choose a 262,144-token window for
  `gemma4:31b-mlx`.
- `clampChunkTokens` (`src/tokens.ts`) sets the chunk budget to the window
  minus `contextReserveTokens` (32k here): 230,144 tokens. It is called
  from `summarizePartition` in `src/generate.ts`.
- So a 6,000-line diff (`242f311`) went to the 31B model as one
  ~166k-token prompt. It never finished: it was stopped after a long
  wait, with the GPU pegged throughout.

Measured on this machine (summary stage, `gemma4:31b-mlx`, window 262k):

| Chunk                           | Model state | Time                 |
| ------------------------------- | ----------- | -------------------- |
| ~38.5k tokens (`33a914a`)       | cold        | over 300 s (aborted) |
| same ~38.5k-token prompt, again | warm        | 96 s                 |
| ~2.9k tokens                    | warm        | 31 s                 |
| ~166k tokens (`242f311`)        | warm        | never finished       |

The final stage is slow too: `muse-glimmer:30b-mlx` took 91 s on a
~900-token prompt, so generation speed matters as well as prompt size.
The warm 96 s may be flattered by Ollama's prompt cache, since the same
prompt had just been sent.

### Proposal

1. Add an Ollama-only chunk cap, applied in `clampChunkTokens` after the
   window clamp, so an `ollama:` summary model never gets a chunk larger
   than the cap. Larger diffs then split into more, shorter requests,
   which the existing chunk loop already handles.
2. Pick the default from measurements, not guesswork. Run
   `node bin/stopwatch.ts <model>` (synthetic commits of about 400, 8.5k
   and 40k tokens) on a few local models, and choose a cap that keeps a
   cold request well under 300 s on a typical machine. 16-32k tokens is
   the starting guess.
3. Make it configurable, for example `ollama.maxChunkTokens`, because a
   fast GPU can take much more than a laptop. The global
   `maxChunkTokens` (default 600,000) stays as the overall ceiling.

### Decide while building

- **Should `num_ctx` shrink too?** cco sends the whole resolved window as
  `options.num_ctx` (`buildChatRequest`, `src/ollama.ts`), so Ollama
  reserves memory for 262k tokens even for a 30k chunk. A cold load at
  that size is part of the slowness. Pinning `num_ctx` to the cap plus
  the reserve would cut it. But the `"auto"` probe preloads the model
  with no `num_ctx`, so a smaller `num_ctx` on the next request makes
  Ollama reload the model. The probe and the request must agree.
- **Keep the truncation check consistent.** The check in
  `runOllamaPrompt` compares `prompt_eval_count` with the `num_ctx` that
  was sent. Whatever `num_ctx` becomes, the check must use that number.
  AGENTS.md lists this as load-bearing.
- **The final stage is not chunked.** Its input is the summaries, so the
  cap does not help a slow final model. Say so in the docs rather than
  pretend.

### Done when

- A ~166k-token diff completes on `gemma4:31b-mlx`, with every request
  under 300 s, and the stopwatch table is recorded in a design record.
- Tests cover the cap in `clampChunkTokens` (Ollama only, never above the
  window budget, Claude unaffected) and the chosen `num_ctx` behaviour.
- README's "Slow models" section explains the cap.

## 2. Known gaps in the shipped TypeSafe checks

Each is small. Fix or measure when touching the check.

- **`subject_primary` (0.2) has no churn-led control.** Real options on
  split commits scored 0.82 at the lowest, and one synthetic churn-led
  subject scored 0.03, but no set of real churn-led subjects was tested.
  Build one, for example by writing options from only the low-priority
  summaries, before trusting the threshold.
- **Grammar-style custom instructions are half caught.** Past-tense
  violations were flagged 9 times in 18, and British spelling was never
  flagged. The 0.2 threshold leans towards silence. Tense could be
  checked in code instead.
- **Near-duplicate removal only catches near-verbatim rewrites.** On
  hand-labelled reworded pairs, the duplicate question scored an AUC of
  0.48. A "same facts" wording reached 0.71 but still dropped distinct
  options, and was rejected. With 10 options, real near-duplicates stay.
- **The mixed-commit warning has thin real evidence.** Only 5 real mixed
  commits were in the test (4 caught). It was never run live on a
  genuinely mixed staged diff, and file-list evidence skips it because it
  was never tested.
- **Thresholds are tuned on `jev-1.13.0`.** If `typesafe.model` changes,
  re-run the tuning before trusting them (`typesafe.model` is pinned for
  this reason).
- **Regenerating flagged messages in non-interactive runs** was deferred:
  no real option was flagged in tuning, so there was nothing to
  regenerate. Revisit if a model starts producing flagged first options.

## 3. Rejected TypeSafe ideas: what would reopen them

Not active work. Each was tested and rejected; the evidence is in the
design record under "Rejected features". Reopen only if the condition
holds.

- **Autopick (Jev picks which option to commit).** Reopen for a model
  whose first option often carries a warning. Generate 3 options per
  commit, skip flagged options in model order, and judge blind against
  option 0. Build the guard version only if it fires on 10% or more of
  commits and wins the blind comparison.
- **Breaking-change marker.** Reopen for a repository whose release
  tooling reads `!`, with enough marked commits to set a threshold. Ship
  it as a warning ("this looks like a breaking change"), never as an edit
  to the message, because a false `!` cuts a major release.
- **Scope from history.** If scope drift still matters, try a non-Jev
  route first: list the past scopes, most used first, in the final
  prompt, and let the model apply the conventions. Test it with the same
  history replay (options from earlier commits only, then compare with
  the scope actually used).
- **Picker search.** Reopen for much longer option lists, or for requests
  about qualities the words do not show (tone, length, emphasis).
  Measure first. Length and counts belong in code. If built, rank with
  one Choice across all options, which beat a Score per option (60 of 60
  against 42 of 60 top-1).

## 4. Open question

- **Per-feature toggles under `typesafe`?** Today `enable` turns
  everything on: the support checks, custom-instruction check, gitmoji
  check, duplicate removal and mixed-commit warning. That is fine while
  every part is non-blocking. Add a toggle for any part that turns out to
  misbehave.
