# TODO

Open work, most useful first. Finished and rejected work is recorded in
`docs/superpowers/specs/` - the TypeSafe items below build on
`2026-10-19-typesafe-candidate-check-design.md`, which holds the test
methods and numbers they refer to.

## 1. Fix bugs found in review

An independent review of the whole codebase (2026-10-20) found these.
All predate the TypeSafe work: the code involved is the same on `main`.
Each was checked against the code; "reproduced" means a script showed the
failure. Line numbers are as of commit `bec0073` - search for the named
function if they have moved. Every fix needs a test that fails first.

### 1a. `$OLLAMA_HOST` is never used

- **Where:** `DEFAULT_CONFIG.ollama.host` in `src/config.ts` (line 39) is
  `DEFAULT_OLLAMA_HOST`. `resolveOllamaHost` in `src/ollama.ts` (line 71)
  falls back to `$OLLAMA_HOST` only when the configured host is blank.
- **Failure:** the merged config always carries
  `http://localhost:11434`, so the environment variable is never reached.
  With `export OLLAMA_HOST=http://remote-box:11434` and no `ollama.host`
  in any config, every `ollama:` run goes to localhost and fails with
  `Cannot reach the Ollama server at http://localhost:11434`.
- **Contradicts:** README (Ollama section), `--help` for `--ollama-host`,
  the `OllamaConfig.host` doc in `src/types.ts`, and the Ollama design
  record, which all say `$OLLAMA_HOST` is the fallback.
- **Reproduce:** `OLLAMA_HOST=http://remote-box:11434 node --input-type=module -e 'const {resolveConfig}=await import("./src/config.ts"); const {resolveOllamaConfig}=await import("./src/ollama.ts"); console.log(resolveOllamaConfig(resolveConfig({}, {}).ollama).host)'`
  prints `http://localhost:11434`. Reproduced.
- **Fix:** leave the default host unset, so `resolveOllamaHost` can fall
  back to the environment and then to `DEFAULT_OLLAMA_HOST`. Keep the
  precedence: config, then `$OLLAMA_HOST`, then localhost.
- **Test gap:** the tests call `resolveOllamaHost` directly, never
  through `resolveConfig`. Add one that goes through both.

### 1b. Ctrl-C or Ctrl-D at the commit prompt exits with code 0

- **Where:** `confirmCommit` in `src/ui/editor.ts` (line 64), and the same
  pattern in `selectWithReadline` in `src/ui/interactive.ts` (line 243,
  the picker's fallback).
- **Failure:** at "Commit this message? [Y/n/e]", readline is in raw
  mode, so Ctrl-C reaches readline, not the process, and the SIGINT
  handler in `src/cli.ts` (line 224) never runs. With no `SIGINT` or
  `close` listener on the interface, readline just closes. The pending
  question never settles, the event loop empties and Node exits. `run()`
  never returns, so the exit code stays 0 and "Aborted. Nothing was
  committed." is never printed. Nothing is committed, but a script
  wrapping `cco` sees success. Ctrl-D behaves the same; typing `n` works.
- **Reproduce:** drive the prompt in a pseudo-terminal (for example with
  Python's `pty`), send `\x03`, and read the exit code: 0. Reproduced.
- **Fix:** in both prompts, listen for `SIGINT` and `close` on the
  readline interface and settle the promise: treat it as "no" (exit 1
  with "Aborted"), or reject with `ClaudeCommitError('Generation was
cancelled.')` to match the rest of the CLI.

### 1c. An editor killed by a signal still commits the unedited message

- **Where:** `runEditor` in `src/ui/editor.ts`: the `exit` handler (line 54) resolves when `code === 0 || code === null`. Called from the "edit"
  paths in `src/cli.ts` and `src/ui/interactive.ts`.
- **Failure:** the user chooses `e`, then presses Ctrl-C while
  `code --wait` (or any waiting editor) is open. The editor dies from the
  signal, so `code` is `null` and the edit counts as successful. The
  unchanged temp file is read back and `commit()` runs, so the user who
  pressed Ctrl-C to back out gets a commit. git itself treats an editor
  killed by a signal as an error.
- **Reproduce:** set `GIT_EDITOR` to a script that runs `kill -TERM $$`
  and call `editInEditor('original')`: it resolves with the original
  text. Reproduced.
- **Fix:** use the `(code, signal)` arguments of the `exit` event and
  reject when `signal` is not null, for example "Editor was killed by
  SIGTERM; nothing was committed."

### 1d. The default `"auto"` context fails for Ollama model names without a tag

- **Where:** `probeOllamaContext` in `src/ollama.ts`: the match at line
  146 compares the configured name exactly with `/api/ps`'s `name` and
  `model`.
- **Failure:** with `ollama:mistral` (no `:tag`), the preload succeeds,
  because Ollama treats a missing tag as `latest`. But `/api/ps` reports
  `mistral:latest`, nothing matches, and the run stops with "Ollama
  loaded "mistral" but did not report its context window in /api/ps".
  Names with an explicit tag, such as `gemma4:31b-mlx`, are unaffected,
  which is why it went unnoticed.
- **Reproduce:** stub `fetch` to return the documented `/api/ps` body
  (`"name": "mistral:latest"`) and call
  `probeOllamaContext('mistral', ...)`: it throws. Confirmed against
  Ollama's documented response shape, not a live server.
- **Fix:** normalise before comparing: add `:latest` when the name has no
  tag after its last `/`, or strip `:latest` from both sides.

### 1e. `"ollama.keepAlive": 0` turns the context probe into an unload

- **Where:** the preload in `probeOllamaContext` (`src/ollama.ts`, around
  line 129) sends `messages: []` plus `keep_alive` whenever `keepAlive`
  is set. `OllamaConfig.keepAlive` documents `0` as valid.
- **Failure:** Ollama's API defines an empty `messages` array with
  `keep_alive: 0` as "unload this model". The following `/api/ps` has no
  entry for it, and the run fails with the same "did not report its
  context window" error as 1d, which points the user at the wrong cause.
- **Reproduce:** a stubbed probe with `keepAlive: 0` sends
  `{"messages":[],"stream":false,"keep_alive":0}`. The server behaviour
  comes from Ollama's docs; not run against a live server.
- **Fix:** leave `keep_alive` out of the probe when it is 0 and send it
  only on real requests, or reject `keepAlive: 0` with `"auto"` and say
  why.

### 1f. `--no-spinner` is ignored in interactive mode

- **Where:** `src/cli.ts` (line 275) passes only `verbose` and the abort
  controller to `runInteractive`. `src/ui/interactive.ts` (line 45) builds
  its spinner from `process.stderr.isTTY` alone.
- **Failure:** `cco -i --no-spinner` still animates. The README and
  `--help` describe the flag without limiting it to non-interactive
  runs. Cosmetic.
- **Fix:** pass `opts.spinner !== false` through `InteractiveOptions` and
  gate the spinner the way `runNonInteractive` does. Add a test; no test
  covers the flag today.

### 1g. Ollama's re-split retry never runs for small windows

- **Where:** `MIN_RETRY_CHUNK_TOKENS = 8_000` in `src/generate.ts` (line 205) and the check that uses it (line 273), with `clampChunkTokens` in
  `src/tokens.ts`, which keeps three quarters of a small window.
- **Failure:** Ollama's 4k tier, or an 8k or 16k model, gives chunk
  budgets of 3,072, 6,144 or 12,288 tokens. Halving gives 1,536, 3,072
  or 6,144, all below the 8,000 floor. So the "prompt is too long" error
  cco raises for a truncated Ollama prompt is thrown, instead of
  re-splitting as the Ollama design record says it will. At a 32k window
  the retry runs once. The floor was sized for Claude windows.
- **Reproduce:** traced through the arithmetic, not run against a server.
- **Fix:** scale the floor with the window (for example
  `min(8_000, chunkTokens / 4)`), or skip it for Ollama, whose rejection
  already means truncation. This fits naturally with item 3 (chunk cap).

### 1h. Minor, to check while nearby

- **Truncation check under prefix caching (unverified).** The check in
  `runOllamaPrompt` hedges between `prompt_eval_count` and the cached
  count with `max()`. In principle it could miss a truncation smaller than
  a cached system-prompt prefix. The reviewer judged this too speculative
  to list as a bug. Confirm or rule it out with a stubbed response.
- **Types newer than `engines`.** `@types/node` is version 26 while
  `engines` says Node 24.21, so the typecheck accepts Node 26-only APIs
  that would fail for Node 24 users. Pin `@types/node` to 24, or run CI's
  tests on Node 24 as well.

## 2. Fix the `claude-review` workflow

### What fails and why

The `claude-review` check (`.github/workflows/claude-code-review.yml`)
fails on every pull request. It has failed on every run since at least
2026-10-15: PR #32, the dependabot PRs and `factory/party-time`. So PRs
get no Claude code review, and the check is always red.

The workflow checks out `anthropics/claude-code` at a pinned commit
(`2301018b1f61073c501a8e7a4813ef48c239163b`) into
`.claude-code-marketplace`. It then passes that local path to
`anthropics/claude-code-action` (pinned to v1.0.248) as
`plugin_marketplaces` and installs `code-review@claude-code-plugins`.
The action stops while adding the marketplace:

```plaintext
✘ Failed to add marketplace: The name 'claude-code-plugins' is reserved for official Anthropic marketplaces and can only be used with GitHub sources from the 'anthropics' organization.
##[error]Action failed with error: Failed to add marketplace '/home/runner/work/claude-commit/claude-commit/.claude-code-marketplace' (exit code: 1)
```

Claude Code now refuses that reserved marketplace name from a local
directory. The local checkout existed only to pin the marketplace to a
commit; the workflow's own comment says the action accepts a marketplace
only as a bare `.git` URL (no ref) or a local path.

### Ways to fix it

1. **Use the GitHub source:** set `plugin_marketplaces` to
   `https://github.com/anthropics/claude-code.git` and drop the checkout
   step. This satisfies the name rule, but the plugin is no longer pinned
   and follows the marketplace's default branch.
2. **Keep it pinned under another name:** only possible if the action or
   Claude Code allows renaming a local marketplace. Check the current
   `claude-code-action` docs. Renaming the checkout's
   `.claude-plugin/marketplace.json` in the workflow before the action runs
   may work, but it is fragile.
3. **Drop the plugin:** give the action a plain review prompt without
   `plugins`. This needs no marketplace, at the cost of the
   `code-review` plugin's behaviour.

Option 1 is the smallest change. Decide whether losing the pin is
acceptable: the other actions in the repo are pinned to commit SHAs on
purpose (`9b2835e`, "pin claude actions to commit SHAs").

### Fixed when

`claude-review` passes on a pull request and posts review comments. The
`@claude` workflow (`.github/workflows/claude.yml`) uses the same action
version but no plugin marketplace, so it is not affected.

## 3. Cap Ollama chunk size

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

## 4. Known gaps in the shipped TypeSafe checks

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

## 5. Rejected TypeSafe ideas: what would reopen them

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

## 6. Open question

- **Per-feature toggles under `typesafe`?** Today `enable` turns
  everything on: the support checks, custom-instruction check, gitmoji
  check, duplicate removal and mixed-commit warning. That is fine while
  every part is non-blocking. Add a toggle for any part that turns out to
  misbehave.
