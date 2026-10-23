# Design: TypeSafe candidate check

**Status:** Implemented

## Behaviour

With `typesafe.enable` (or `--typesafe`), cco checks its messages before
showing them: every option before the picker opens, or the single message
of a non-interactive run. One request to TypeSafe's Jev model asks typed
questions about every candidate. Code then flags doubtful candidates,
moves them down and drops near-duplicates.

Jev answers three kinds of question, and cannot write text:

- a **Noul** returns the probability that a yes/no statement is true
- a **Choice** picks one option from a list and reports its confidence
- a **Score** places the answer on an ordered scale of described levels

The check reads the same evidence the final model wrote from: the diff
summaries, or the file list in filenames-only mode. When the change has
low-priority paths, the evidence keeps the two groups apart.

## Design rules

- **Off unless enabled.** Everything, including the gitmoji check that
  needs no request, sits behind `typesafe.enable`. With it off, `cco`
  behaves exactly as it did before the feature.
- **One request per run.** Every question shares the request that holds
  the summaries and the options.
- **Jev never blocks a commit.** A failed request leaves the model's order
  in place and says why. A missing key with the check on is an error
  before any model call.
- **Code decides.** Thresholds are named constants in `src/typesafe.ts`,
  each with the evidence that set it, tuned on real `cco` output before
  shipping.
- **No diff content leaves the machine.** Jev sees the summaries (or file
  paths) and the options.

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

Once per request, with summary evidence only: `mixed_commit` (yes/no):
does `evidence.primary` describe two or more unrelated changes that would
each make sense as their own commit? An answer of 0.6 or more prints a
suggestion to split the commit. File-list evidence skips the question,
because it was never tested.

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

### Mixed commits (2026-10-20)

Cases: 37 clean (each commit's own primary summaries from the opus and
local-model runs), and 37 mixed, made by interleaving the paragraphs of two
unrelated commits' summaries. Pairs about the same topic were skipped.
AUC was 0.92. Four "clean" cases scored high, and on reading, all four were
really mixed:

- `700705b`: DevSkim scanning plus an unrelated action bump, in both runs
- `242f311`: the opus summary opens "This change does two separate things"
- `295b35a`: a README note plus an accidental table reformat

After relabelling, at 0.6 the warning caught 32 of 37 synthetic mixes and
4 of 5 real ones, and warned on none of 33 truly clean commits (highest
0.41).

So the check runs for a single non-interactive message too: that is where
most commits are made, and the mixed-commit question rides in the same
request.

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
   rejected after testing (see Rejected features).
6. **Hand-rolled HTTP** - rejected in favour of `@typesafe-ai/sdk`, which
   brings typed answers, retries and error classes. Tests inject `fetch`
   into the real client rather than mocking the module.

## Rejected features

Three further uses of Jev were tested and not built. The test scripts
were one-off and not kept; each method below is described in enough
detail to repeat. `TODO.md` lists what would reopen each one.

### Autopick for non-interactive runs

Idea: write several options in a non-interactive run and let Jev choose
the one to commit.

The real pipeline wrote 3 options per commit for the 20 tuning commits,
with opus for both stages, and for 17 of them with
two local models (one for summaries, one for messages). The 3 largest diffs
failed on the local-model side. Each picking
policy was compared with option 0, and opus judged every case where they
differed, seeing the summaries and both messages in random A/B order.

| Policy                             | Opus: differs, won | Local: differs, won |
| ---------------------------------- | ------------------ | ------------------- |
| Rank by a specificity score        | 10, won 1          | 7, won 0            |
| Jev Choice: "best for the history" | 4, won 0 (1 tie)   | 5, won 0            |
| Guard: skip flagged options only   | never differs      | never differs       |

Option 0 never carried a warning with either model, so the guard had
nothing to do, and every policy that moved away from option 0 lost (1 win
in 26). Models put their best option first. This is also why the picker
keeps the model's order (see Ordering).

### Scope and breaking change from history

Idea: before the final stage, a Choice picks a scope from the
repository's history and a Noul decides whether the change is breaking;
confident answers go into the final prompt.

History replay on the last 50 scoped commits: for each, options were
built only from earlier commits (the 40 most-used scopes, each with its 3
most-touched paths), with the commit's diff and paths as evidence. The
breaking-change question also ran on the summaries of the 20 tuning
commits.

| Question                | Result                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Scope, confidence ≥ 0.8 | Used on 22 of 50 commits, matched the scope used 12 times                                     |
| Scope, confidence ≥ 0.9 | Used on 11, matched 7                                                                         |
| Scope, new areas        | Forced an old scope (at 0.8 or more) onto 5 of the 16 commits that started a new one          |
| Breaking, on diffs      | The 2 real `!` commits scored 0.61 and 0.75; the highest unmarked commit 0.79                 |
| Breaking, on summaries  | Fired on 6 of 20 commits at 0.6 and 3 at 0.85; only `2d11c56` (0.93) is marked `!` in history |

- **Scope:** some mismatches were wanted consistency (`release` instead
  of `publish`), but others overrode conventions: dependency bumps got
  `workflows` where the history uses `deps`. About 55% agreement is not
  worth reshaping the prompt for.
- **Breaking change:** the question finds default and behaviour changes,
  which strict semver calls breaking but this history leaves unmarked
  (`!` on 2 of 134 commits). Only 0.9 matches that practice, on a single
  positive case with a 0.04 margin, and a false `!` cuts a major release.
  Opus did miss the real one (`!` on none of its 10 options for
  `2d11c56`).

Jev judges what is true of the text; it does not know a repository's
conventions, and both questions depend on them.

### Picker search

Idea: `/` in the picker opens a line for a typed request, and Jev
re-ranks the options by it.

A retrieval benchmark on the 200 real opus options (10 per commit): for 3
targets per commit, sonnet wrote the request a developer would type to
find that option, once naturally and once reworded to avoid the target's
distinctive words. Each request ranked all 10 options three ways.

| Request style | Jev Choice, top 1 | Word overlap, top 1 | Jev Score per option, top 1 |
| ------------- | ----------------- | ------------------- | --------------------------- |
| Natural       | 60 / 60           | 60 / 60             | 42 / 60                     |
| Reworded      | 50 / 60           | 41 / 60             | 27 / 60                     |

People search a visible list with the words they see, where plain word
overlap is already perfect; Jev only wins on reworded requests. A filter
over 10 options already on screen does not repay the picker work. The
test did confirm that one Choice across all options ranks better than a
Score per option.

## Data handling

When enabled, the summaries (or file paths) and candidate messages are
sent to TypeSafe. Diff bodies are never sent. The feature is off by
default for that reason.
