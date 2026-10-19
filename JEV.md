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
| B. Mixed-commit warning          | Planned                                 |
| C. Scope and breaking change     | Planned                                 |
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
- **One request where possible.** In interactive runs, B and E join the
  candidate check's request, which already holds the summaries and the
  options. A non-interactive run sends B on its own. C needs its answer
  before the final model runs, so it is a separate, earlier request. D
  runs only when the user asks for it.
- **Jev never blocks a commit.** A failed request leaves today's
  behaviour in place and says why. A missing key with the check on is an
  error before any model call, as now.
- **Code decides.** Thresholds are named constants with the evidence that
  set them in a comment, and are tuned on real `cco` output before they
  ship.
- **No new data leaves the machine.** Jev sees the summaries, the options
  and, for C, past commit subjects and paths. It never sees diff content.

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

## B. Mixed-commit warning

### Problem

A staged change sometimes contains two unrelated changes. Any message
written for it describes one change and buries the other, and the
history loses an atomic commit. Nothing in `cco` notices this today.

### Behaviour

`cco` prints this warning before the picker opens, or before
confirmation in a non-interactive run:

```plaintext
⚠ These staged changes look like more than one commit. Consider splitting them.
```

The warning never blocks a commit, and `--yes` runs print it too.

### Question

Added to the shared request:

```json
{
  "mixed_commit": {
    "type": "noul",
    "instructions": "Does `evidence.primary` describe two or more changes that are unrelated to each other, so that each would make sense as its own commit?",
    "criteria": {
      "true": "The changes serve different purposes, for example a bug fix and an unrelated feature, or a dependency bump and an unrelated documentation edit",
      "false": "All changes serve one purpose, including supporting edits such as tests, documentation or configuration for that same change"
    }
  }
}
```

Only `evidence.primary` is judged. Low-priority churn such as a lockfile
next to a code change is expected, and is not a second commit.

### Validation before it ships

The tuning harness already holds summaries for 20 commits. Use them as
40 labelled cases:

- 20 clean cases: each commit's own summaries
- 20 mixed cases: the summaries of two unrelated commits joined together

Pick the threshold for zero warnings on clean cases. Then review by hand
the 3 real commits with the highest scores, because some real commits are
mixed.

### Effort

About 1 hour, with the experiment taking a few minutes.

## C. Scope and breaking change from history

### Problem

Scopes drift because the final model never sees the repository's
history. This repository has both `fix(generate)` and `feat(generator)`,
and both `chore(deps)` and `build(deps)`. Breaking changes depend on the
model noticing on its own. A missing `!` gives release tooling the wrong
version bump.

### Behaviour

Only with `conventionalCommits` on. After the summaries and before the
final model, code reads the last 200 commit subjects and the paths each
commit touched (`git log -n 200 --format=%s --name-only`). It collects
every `type(scope)` scope with its 3 most-touched paths. Then one Jev
request decides:

- a confident historical scope adds `Use the scope "<scope>".` to the
  final system prompt
- a confident breaking change adds `Mark this as a breaking change with
"!" after the type or scope.`

Below the thresholds, the prompt is unchanged. The step is skipped when
fewer than 10 past commits have a scope. This adds one request (about
0.3 s) before the final stage.

### Questions

```json
{
  "scope": {
    "type": "choice",
    "instructions": {
      "question": "Which past scope best names the area of the primary change?",
      "inspect": ["`evidence.primary`", "`changed_paths`"],
      "focus": "Match the area of the code that changed, not the kind of change (fix, feature, refactor)"
    },
    "criteria": {
      "<scope>": { "past_paths": ["<path>", "<path>", "<path>"] },
      "new_area": "The primary change is in an area no listed scope covers",
      "several_areas": "The primary change spans two or more listed areas about equally"
    }
  },
  "breaking_change": {
    "type": "noul",
    "instructions": "Does `evidence.primary` describe a change that makes an existing user's setup stop working or behave differently without them changing anything?",
    "criteria": {
      "true": "A flag, config key, default value, output format or public function is removed, renamed or changed in a way existing users rely on",
      "false": "The change adds behaviour, fixes a defect without changing documented behaviour, or changes only internals"
    }
  }
}
```

Options are capped at the 40 most frequent scopes. When two scopes
differ only by spelling (`generate` and `generator`), code keeps the more
frequent one before building the options.

### Composition

- Use the scope when Choice confidence is at least 0.8 and the answer is a
  real scope.
- Mark the change as breaking when the Noul is at least 0.8.
- Both values are placeholders until validated.

### Validation before it ships

Replay history. For each of the last 50 commits with a scope, build the
options from the commits before it, then compare Jev's pick with the
scope actually used. Report accuracy at each confidence threshold.

The history has only 2 commits marked `!`, too few to validate the
breaking-change question. Add synthetic cases from real summaries with a
renamed config key or a changed default. As a control, run 20 ordinary
commits and expect no `!`.

### Effort

1 to 2 hours.

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
  prompt's gitmoji guide, and it works without a TypeSafe key.

Both warnings move an option to the bottom of the picker. In a
non-interactive run, the warnings for the one message print on stderr.
The numbers are in the design record, under "Custom instructions and
gitmoji".

## Order of work

1. **B, mixed-commit warning.** A cheap experiment first. It covers
   non-interactive runs too.
2. **C, scope and breaking change.** Its own request, and a history
   replay to validate.
3. **D, picker search.** The most UI work, and only useful with `-i`.

After each feature: run tests, typecheck and lint, run a live
end-to-end check, update the design record and README, and commit with
`git -c commit.gpgsign=false`. One PR covers the lot.

## Open questions

- Should each feature get its own toggle under `typesafe`, or is
  `enable` enough? The plan assumes enough, because every feature is
  either non-blocking or only shapes the prompt. A toggle can be added if
  one misbehaves.
