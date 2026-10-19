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
- `specificity` (score, 4 levels): from "could describe any commit" to "a
  `git log --oneline` reader knows what changed".
- `subject_primary` (yes/no, only when low-priority paths matched): does
  the subject describe a primary change?

Per pair: `dup_i_j` (yes/no): do the two say the same thing with the same
emphasis?

## Composition

Code makes every decision from constants in `src/typesafe.ts`:

- A `subject_shown` or `subject_primary` answer below 0.2, or an
  `edits_shown` answer below 0.45, adds a warning. The picker shows the
  warning under the candidate.
- Candidates without a warning come first, then by specificity. Ties keep
  the model's order.
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

## Approaches considered

1. **One `supported` question covering every claim** - rejected. Jev reads
   instructions literally, so motivations and dependabot release notes
   counted as unsupported claims. It flagged 40% of good messages.
2. **Regenerating flagged messages in non-interactive mode** - deferred.
   It adds a request and latency to every commit, and no real option was
   flagged in tuning, so there was nothing to regenerate.
3. **A facts-based duplicate question** - rejected after testing (see
   Threshold tuning). It separated better but still dropped distinct
   options at any threshold that caught duplicates.
4. **Choosing the scope and breaking-change marker before the final stage** -
   deferred to a separate change (opportunity #2 in the Jevify review).
5. **Hand-rolled HTTP** - rejected in favour of `@typesafe-ai/sdk`, which
   brings typed answers, retries and error classes. Tests inject `fetch`
   into the real client rather than mocking the module.

## Data handling

When enabled, the summaries (or file paths) and candidate messages are
sent to TypeSafe. Diff bodies are never sent. The feature is off by
default for that reason.
