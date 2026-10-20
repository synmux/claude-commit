# Jev in `claude-commit`

This is the plan for using TypeSafe's Jev model in `cco` beyond the shipped
candidate check. Jev answers typed questions about text in about half a
second, at about $0.04 per million input tokens. It
cannot write text. In `cco`, Claude still writes every summary and message.
Jev judges them, and code acts on the answers.

Jev has three question types:

- a **Noul** returns the probability that a yes/no statement is true
- a **Choice** picks one option from a list and reports its confidence
- a **Score** places the answer on an ordered scale of described levels

## Status

| Item                             | State                                   |
| -------------------------------- | --------------------------------------- |
| Candidate check (interactive)    | Shipped and tuned: `79eade2`, `596ee5e` |
| A. Autopick (non-interactive)    | Rejected after testing (see A)          |
| B. Mixed-commit warning          | Shipped (see B)                         |
| C. Scope and breaking change     | Rejected after testing (see C)          |
| D. Picker search                 | Planned                                 |
| E. Instruction and format checks | Shipped (see E)                         |

All of it ships in one PR from `synmux/jev`, one commit per feature.

The shipped check is described in
`docs/superpowers/specs/2026-10-19-typesafe-candidate-check-design.md`. In
short, each option gets three judgments, and code flags options from
fixed thresholds:

- does the evidence show the change the subject names?
- does it show the edits the body claims?
- is the subject about the primary changes?

Flagged options move to the bottom of the picker, and near-duplicates
are dropped. The model's order is otherwise kept (see A for why). Tuning
on 200 real opus options flagged none of them and caught all 60 known-bad
controls.

## Shared design rules

These apply to every feature below.

- **Off unless enabled.** Everything sits behind `typesafe.enable`. With
  the check off, `cco` behaves exactly as it does today.
- **One request where possible.** B and E join the candidate check's
  request, which already holds the summaries and the options. With
  TypeSafe on, that check runs on every run, including the single
  message of a non-interactive one. D runs only when the user asks for
  it.
- **Jev never blocks a commit.** A failed request leaves today's
  behaviour in place and says why. A missing key with the check on is an
  error before any model call, as now.
- **Code decides.** Thresholds are named constants with the evidence that
  set them in a comment, and are tuned on real `cco` output before they
  ship.
- **No new data leaves the machine.** Jev sees the summaries, the options and,
  for D, the user's typed search. It never sees diff content.

## A. Autopick for non-interactive runs (rejected)

### Idea

A non-interactive run would ask the final model for several options
(default 3) and let Jev pick the one to commit, in place of whatever the
model wrote first.

### Test

The tuning harness ran on the same 20 commits with two model setups:

- the repository config: opus for both stages
- your global config: `ollama:gemma4:31b-mlx` for summaries and
  `ollama:muse-glimmer:30b-mlx` for messages, on 17 commits (the 3 largest
  diffs failed on the Ollama side)

Each commit got 3 options. Three picking policies were compared with
option 0, and opus judged every case where the pick differed from
option 0. The judge saw the summaries and both messages in a random A/B
order.

| Policy                             | Opus: differs, won | Ollama: differs, won |
| ---------------------------------- | ------------------ | -------------------- |
| Rank by a specificity score        | 10, won 1          | 7, won 0             |
| Jev Choice: "best for the history" | 4, won 0 (1 tie)   | 5, won 0             |
| Guard: skip flagged options only   | never differs      | never differs        |

### Decision

Not built. Option 0 never carried a warning with either model, so the
guard had nothing to do. Every policy that moved away from option 0 lost
the blind comparison: 1 win in 26 cases. Models already put their best
option first. Picking among options cannot beat that, and it would add
an extra model call's worth of output and a Jev request to every commit.

The same evidence changed the shipped picker. It used to sort passing
options by the specificity score, which demoted better options. It now
keeps the model's order, and the specificity question is gone.

### What would reopen it

A model whose first option often carries a warning. Re-run the harness
(`tune/autopick.ts <generated-dir> guard`) on that model. If the guard
fires on 10% or more of commits and wins the blind comparison, build
the guard version of autopick only.

## B. Mixed-commit warning (shipped)

### Result

A `mixed_commit` Noul on `evidence.primary` joins the candidate check's
request. At 0.6 or above, both flows print:

```plaintext
⚠ These staged changes look like more than one commit. Consider splitting them.
```

Test: 37 clean and 37 synthetic mixed cases gave an AUC of 0.92. Every
high-scoring "clean" case turned out to be a real mixed commit, such as
`700705b` (DevSkim plus an unrelated action bump). After relabelling, the
warning caught 32 of 37 synthetic mixes and 4 of 5 real ones, with no
false warnings on 33 truly clean commits.

To reach non-interactive runs inside the same request, the candidate
check now runs whenever TypeSafe is on, including on a single message.
That also brought the code in line with the documented rule that a
missing key with `typesafe.enable` on is an error before any model call.
File-list evidence skips the question, because it was never tested.

## C. Scope and breaking change from history (rejected)

### Idea

Before the final stage, a Jev Choice would pick a scope from the
repository's history, and a Noul would decide whether the change is
breaking. Confident answers would be written into the final prompt.

### Test

History replay on the last 50 scoped commits. For each one, the options
were built only from the commits before it (the 40 most-used scopes,
each with its 3 most-touched paths). Evidence was the commit's diff and
changed paths. The breaking-change question also ran on the summaries
of the 20 tuning commits.

| Question                | Result                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Scope, confidence ≥ 0.8 | Used on 22 of 50 commits, matched the scope used 12 times                                     |
| Scope, confidence ≥ 0.9 | Used on 11, matched 7                                                                         |
| Scope, new areas        | Forced an old scope (at 0.8 or more) onto 5 of the 16 commits that started a new one          |
| Breaking, on diffs      | The 2 real `!` commits scored 0.61 and 0.75; the highest unmarked commit 0.79                 |
| Breaking, on summaries  | Fired on 6 of 20 commits at 0.6 and 3 at 0.85; only `2d11c56` (0.93) is marked `!` in history |

### Decision

Neither half was built.

- **Scope.** Some mismatches were the consistency C was meant to give
  (`release` instead of `publish`), but others overrode real
  conventions: dependency bumps got `workflows` where the history uses
  `deps`. Confident wrong answers on new areas would push stale scopes
  into the prompt. About 55% agreement is not worth reshaping the prompt
  for.
- **Breaking change.** The question finds default and behaviour changes
  (a renamed config key, a changed default), which strict semver calls
  breaking but this history leaves unmarked: `!` appears on 2 of 134
  commits. Only a 0.9 threshold matches that practice, and it rests on a
  single positive case with a 0.04 margin. A false `!` makes release
  tooling cut a major version, and nothing in this repository reads `!`
  yet. Opus did miss the real one (`!` on none of its 10 options for
  `2d11c56`), so the gap is real but small.

### What would reopen it

- **Breaking change:** a repository whose release tooling reads `!`,
  with enough marked commits to set a threshold. Ship it as a warning
  only ("this looks like a breaking change"), never as an edit to the
  message.
- **Scope:** if drift still matters, try a non-Jev route first. Put the
  past scopes, most used first, in the final prompt, and let the model
  apply the conventions. Test it with the same replay.

## D. Picker search

### Problem

With 10 options, the right one is often there but buried. The only way
to steer today is to cancel and regenerate with a new prompt, which costs
tens of seconds and a model call.

### Behaviour

In the picker, `/` opens a one-line input at the top. Typing what you
want ("mention the tests", "shorter", "about the spinner") and pressing
Enter re-ranks the options by that request. The cursor moves to the
best match. `Esc` clears the search and restores the original order.
`/` and its hint appear only with `typesafe.enable` on.

### Question

One Score per option, in one request:

```json
{
  "c0_match": {
    "type": "score",
    "instructions": "How well does `candidates[0]` match what the user asked for in `request.wanted`?",
    "criteria": [
      "It does not do what `request.wanted` asks",
      "It partly does what `request.wanted` asks",
      "It does what `request.wanted` asks",
      "It does exactly what `request.wanted` asks, better than a typical option would"
    ]
  }
}
```

The options' warnings and order from the candidate check still break
ties.

### Risks

- Requests about length ("shorter") or counting ask Jev for something it
  is documented to be weak at. Code should measure length itself: when
  the request mentions length, sort by subject length in code instead.
  This needs a small keyword rule.
- The picker is a `SelectPrompt` from the Clack terminal UI library, and
  it has no text input. The search line needs
  custom key handling and its own render state, tested through the
  existing fake-stream picker tests.

### Effort

About 2 hours, most of it in the picker.

## E. Instruction and format checks (shipped)

### Result

Both halves were tested before building, and the data split them:

- **Custom instructions use Jev.** A `follows_custom` Noul per option
  joins the candidate check's request when `customPrompt` is set. It
  flagged none of 108 compliant options and caught 38 of the 59 labelled
  violations. Tense was the weak spot. An instruction Jev cannot check,
  such as one that needs the branch name, is never flagged.
- **Gitmoji vs type uses code.** A lookup table in `src/gitmoji.ts` beat
  the Jev question: it found all 9 clashes in 251 options with no false
  flags, where Jev found 4 and was inconsistent. The table also feeds the
  prompt's gitmoji guide. Like everything else it runs only with
  `typesafe.enable` on, but it needs no request, so it also covers
  single non-interactive messages.

Both warnings move an option to the bottom of the picker. In a
non-interactive run, the warnings for the one message print on stderr.
The numbers are in the design record, under "Custom instructions and
gitmoji".

## Order of work

1. **D, picker search.** The most UI work, and only useful with `-i`.

After each feature: run tests, typecheck and lint, run a live
end-to-end check, update the design record and README, and commit with
`git -c commit.gpgsign=false`. One PR covers the lot.

## Open questions

- Should each feature get its own toggle under `typesafe`, or is
  `enable` enough? The plan assumes enough, because every feature is
  either non-blocking or only shapes the prompt. A toggle can be added if
  one misbehaves.
