# Design: TypeSafe candidate check

**Status:** Implemented

## Behaviour

With `typesafe.enable` (or `--typesafe`), interactive mode checks each
candidate message before the picker opens. One request to TypeSafe's Jev
model asks typed questions about every candidate. Code then orders the
candidates, adds warnings and drops near-duplicates. The check runs only
when more than one message is requested. A single non-interactive message
has nothing to rank, so it skips the request and the extra latency.

The check reads the same evidence the final model wrote from: the diff
summaries, or the file list in filenames-only mode. When the change has
low-priority paths, the evidence keeps the two groups apart.

## Questions

Per candidate:

- `subject_shown` (yes/no): is the change the subject line names stated in
  the evidence?
- `edits_shown` (yes/no): is every edit or behaviour change the message
  claims stated in the evidence? Stated reasons and motivations are
  ignored.
- `subject_primary` (yes/no, only when low-priority paths matched): does
  the subject describe a primary change?
- `follows_custom` (yes/no, only when `customPrompt` is set): does the
  message follow the user's custom instructions, or do they not apply? The
  instructions go into state as `custom_instructions`.

Per pair: `dup_i_j` (yes/no): do the two say the same thing with the same
emphasis?

## Composition

Code makes every decision from constants in `src/typesafe.ts`:

- A `subject_shown`, `subject_primary` or `follows_custom` answer below
  0.2, or an `edits_shown` answer below 0.45, adds a warning. The picker
  shows the warning under the candidate.
- A gitmoji that clashes with its Conventional Commit type is flagged in
  code (`src/gitmoji.ts`). It sits behind `typesafe.enable` like every
  other check, but needs no request, so it also covers single
  non-interactive messages. Those warnings are passed in as
  `priorWarnings`, so they sort the same way.
- Candidates without a warning keep the model's order, and flagged ones
  follow in the same order. An earlier version also sorted by a
  specificity score, but blind tests showed this demoted better options
  (see Ordering), so that question was removed.
- A near-duplicate answer of 0.85 or more drops the lower-ranked candidate
  of the pair.
- Every expected answer is read before anything is decided. A missing
  answer is an error, not a pass.

## Failure handling

- **Missing key when enabled:** a `ClaudeCommitError` before any model is
  called. The user turned the check on, so a silent skip would look like a
  checked run.
- **API failure:** the candidates stay in the model's order with no
  warnings. The picker prints the reason. The commit is never blocked.
- **Cancellation:** stops the run like any other cancelled stage.

The SDK client is created with one retry and a per-attempt timeout from
`typesafe.timeout` (default 5 s), with logging off so it cannot draw over
the spinner.

## Evidence for the questions and thresholds

### Question design (raw diffs, human-written messages)

The questions were first tested on 2026-10-19 against the last 20 non-merge
commits of this repository, using `jev-1.13.0`. Each real message was
paired with a mismatched real message and the generic `chore: update
files`, and the raw diff served as evidence.

| Question                           | Mismatches caught (< 0.2) | Real messages flagged |
| ---------------------------------- | ------------------------- | --------------------- |
| `supported` (rejected: approach 1) | 19 / 20                   | 8 / 20                |
| `subject_shown`                    | 19 / 20                   | 0 / 20                |
| `edits_shown`                      | 16 / 20                   | 1 / 20                |

Specificity separated cleanly: generic subjects scored 0.00 to 0.01 and
real subjects scored at least 0.95. Duplicate answers on pairs with different
subjects were 0.07 at most. One synthetic paraphrase pair scored only
0.31, so how well the check catches real near-duplicates is
unmeasured. The 0.85 threshold errs toward keeping options.

A live run on this feature's own diff (4 candidates) used 3,784 input
tokens, about $0.00016, and took 0.4 s. The Claude calls in the same run
cost $0.165.

### Threshold tuning (cco's own output)

The thresholds were then tuned on what the check sees in use. The real
pipeline, with this repository's config (opus for both stages, 10 options,
conventional, gitmoji, multiline), wrote options for 20 commits: 12 code
changes and 8 docs, CI or dependency changes. That gave 200 real options
and 900 option pairs, 6 of the commits with low-priority paths. Three
known-bad controls were added per commit:

- option 0 with the subject of another commit
- option 0 with a body bullet taken from another commit
- a haiku paraphrase of option 0

| Question          | Real options, lowest | Known-bad, highest | Threshold | Real flagged | Bad caught |
| ----------------- | -------------------- | ------------------ | --------- | ------------ | ---------- |
| `subject_shown`   | 0.42                 | 0.06               | 0.2       | 0 / 200      | 20 / 20    |
| `edits_shown`     | 0.62                 | 0.34               | 0.45      | 0 / 200      | 20 / 20    |
| `subject_primary` | 0.82                 | not tested         | 0.2       | 0 / 60       | -          |

`edits_shown` was raised from 0.2 to 0.45: at 0.2, 3 of the 20 invented
bullets slipped through.

The duplicate question catches paraphrases (all scored 0.89 or more) but
not reworded real options. Hand labels on the 22 highest-scoring real
pairs put duplicates at 0.75 to 0.86 and options that differ at 0.76 to
0.85, an AUC of 0.48. A wording that asked whether the subjects "state
the same facts" did better (AUC 0.71), but it still dropped 2 of 10
distinct options for every 6 of 12 duplicates it caught, and it lowered
the paraphrase scores. The shipped wording stays at 0.85, where it
dropped 2 of 900 real pairs (one of them a true duplicate).

With 10 options, a real request averaged 9,444 input tokens (about
$0.0004) and took 0.46 s at the median and 0.53 s at most.

### Ordering

The first release sorted passing options by a 4-level specificity score.
A blind test showed this was a mistake. For 37 commits (20 with opus, 17
with the local `gemma4:31b-mlx` and `muse-glimmer:30b-mlx` models), the
top-scoring option of 3 was compared with the model's first option, and
opus judged each pair in random order. Where the two differed, the
specificity pick won 1 of 17 comparisons. It preferred list-like subjects
such as "upgrade pnpm/setup, upload-sarif and setup-node". A Jev Choice
asking which option a maintainer would keep did no better: 0 wins in 9
comparisons, plus 1 tie. The specificity question was removed, and the
model's order is now kept apart from moving flagged options down. The
specificity results in the question-design section above are kept for
the record.

### Custom instructions and gitmoji (2026-10-19)

Custom instructions: 6 instructions on 6 commits, 3 sonnet options
written with each instruction and 3 written without it. Jev judged all 36
options against each instruction.

| Instruction                      | With it: flagged | Without it: flagged                |
| -------------------------------- | ---------------- | ---------------------------------- |
| End with `Refs: #123`            | 0 / 18           | 18 / 18                            |
| Do not use the word "add"        | 0 / 18           | 10 / 18 (10 of 11 real violations) |
| Say which tests cover the change | 0 / 18           | 10 / 18 (all 10 real violations)   |
| Subject in the past tense        | 0 / 18           | 9 / 18                             |
| Ticket id from the branch name   | 0 / 18           | 0 / 18 (cannot be checked)         |
| British spelling                 | 0 / 18           | 0 / 18                             |

None of the 108 compliant options was flagged. The lowest compliant score
was 0.25 (past tense), so the threshold stays at 0.2. Grammatical
judgments such as tense are the weak spot: half the violations got
through.

Gitmoji: a lookup table and a Jev Noul were both run on 251 generated
options. The table found all 9 clashes with no false flags. Jev, at 0.2,
caught 4, falsely flagged `🔒️ feat` (the guide allows security with any
type), and gave two identical `🔧 feat(config)` patterns 0.08 and 0.51.
The table shipped, and the Jev question did not.

## Approaches considered

1. **One `supported` question covering every claim** - rejected. Jev reads
   instructions literally, so motivations and dependabot release notes
   counted as unsupported claims. It flagged 40% of good messages.
2. **Regenerating flagged messages in non-interactive mode** - deferred.
   It adds a request and latency to every commit, and no real option was
   flagged in tuning, so there was nothing to regenerate.
3. **Reordering passing options** - rejected after testing (see
   Ordering). Neither a specificity score nor a Jev Choice beat the
   model's first option.
4. **A facts-based duplicate question** - rejected after testing (see
   Threshold tuning). It separated better but still dropped distinct
   options at any threshold that caught duplicates.
5. **Choosing the scope and breaking-change marker before the final stage** -
   deferred to a separate change (opportunity #2 in the Jevify review).
6. **Hand-rolled HTTP** - rejected in favour of `@typesafe-ai/sdk`, which
   brings typed answers, retries and error classes. Tests inject `fetch`
   into the real client rather than mocking the module.

## Data handling

When enabled, the summaries (or file paths) and candidate messages are
sent to TypeSafe. Diff bodies are never sent. The feature is off by
default for that reason.
