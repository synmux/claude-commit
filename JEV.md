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
| A. Autopick (non-interactive)    | Planned                                 |
| B. Mixed-commit warning          | Planned                                 |
| C. Scope and breaking change     | Planned                                 |
| D. Picker search                 | Planned                                 |
| E. Instruction and format checks | Planned                                 |

All of it ships in one PR from `synmux/jev`, one commit per feature.

The shipped check is described in
`docs/superpowers/specs/2026-10-19-typesafe-candidate-check-design.md`. In
short, each option gets four judgments, and code ranks and flags the
options from fixed thresholds:

- does the evidence show the change the subject names?
- does it show the edits the body claims?
- how specific is the subject?
- is the subject about the primary changes?

Tuning on 200 real opus options flagged none of them and caught all 60
known-bad controls.

## Shared design rules

These apply to every feature below.

- **Off unless enabled.** Everything sits behind `typesafe.enable`. With
  the check off, `cco` behaves exactly as it does today.
- **One request where possible.** A, B and E judge the same state (the
  summaries and the options), so they go out as one request. C needs its
  answer before the final model runs, so it is a separate, earlier
  request. D runs only when the user asks for it.
- **Jev never blocks a commit.** A failed request leaves today's
  behaviour in place and says why. A missing key with the check on is an
  error before any model call, as now.
- **Code decides.** Thresholds are named constants with the evidence that
  set them in a comment, and are tuned on real `cco` output before they
  ship.
- **No new data leaves the machine.** Jev sees the summaries, the options
  and, for C, past commit subjects and paths. It never sees diff content.

## A. Autopick for non-interactive runs

### Problem

A non-interactive run writes one message and commits it. Whatever the
final model produces first is what you get. A weak local model makes this
worse: your global config uses `ollama:gemma4:31b-mlx` and
`ollama:muse-glimmer:30b-mlx`.

### Behaviour

With `typesafe.enable` on, a non-interactive run asks the final model for
`typesafe.autopickCount` options (default 3) in its single call. The
candidate check then ranks them, and `cco` uses the top one. The flow after
that is unchanged: confirmation, `--yes` or `--dry-run` work as before.

- If the top option carries a warning (every option was flagged), `cco`
  still uses it and prints the warning on stderr. It never blocks a commit.
- `--verbose` prints every option with its rank and warnings, so the
  choice can be checked.
- If the check fails, `cco` uses the first option and says why.
- An `autopickCount` of 1 turns autopick off and restores the
  single-message flow.

Interactive runs are unchanged: they still use `interactiveCount` and the
picker.

### Questions

None new. Autopick reuses the shipped candidate check (`subject_shown`,
`edits_shown`, `specificity`, `subject_primary`, `dup_i_j`).

### Composition

Pick the first option from `rankCandidates`. Options with no warnings
come first, then the most specific. Several options make generation more
varied, and `interactiveTemperature` already applies to any request for
more than one option. That setting is shared, and its name becomes
misleading. Rename it `optionTemperature` as a breaking change.

### Config

```json
{ "typesafe": { "autopickCount": 3 } }
```

### Validation before it ships

Run the tuning harness (scratchpad `tune/`) with the global Ollama models
instead of opus, on the same 20 commits:

1. Measure the flag rate on real options. This is the first measure of
   how often a local model invents edits.
2. Count how often the top-ranked option differs from option 0. If it
   never differs, autopick costs time and adds nothing.
3. Compare option 0 with the autopicked option blind, for the commits
   where they differ.

### Effort

1 to 2 hours, plus the Ollama run (local, about 20 minutes).

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

## E. Instruction and format checks

### Problem

Options can ignore `customPrompt`, and the existing check never looks at
it. Options can also mix up their parts. A tuning run produced
`🔧 feat(config): ...`, with a chore gitmoji on a `feat` type.

### Behaviour

Extra per-option judgments in the shared request, flagged like the
existing warnings:

- `follows_custom`, only when `customPrompt` is set. Below the threshold,
  the warning reads "ignores your custom instructions".
- `gitmoji_matches_type`, only when both `gitmoji` and
  `conventionalCommits` are on. Below the threshold, the warning reads
  "gitmoji does not match the commit type".

### Questions

```json
{
  "c0_follows_custom": {
    "type": "noul",
    "instructions": "Does `candidates[0]` follow the instructions in `custom_instructions`?",
    "criteria": {
      "true": "The message does what `custom_instructions` asks, or the instructions do not apply to this change",
      "false": "The message ignores or contradicts something `custom_instructions` asks for"
    }
  },
  "c0_gitmoji_matches_type": {
    "type": "noul",
    "instructions": "Does the gitmoji at the start of `candidates[0].subject` fit its conventional-commit type?",
    "criteria": {
      "true": "The gitmoji's meaning in `gitmoji_guide` fits the type, for example ✨ with feat or 🐛 with fix",
      "false": "The gitmoji's meaning conflicts with the type, for example 🔧 (configuration) with feat"
    }
  }
}
```

`gitmoji_guide` is the guide `src/prompts.ts` already sends to the final
model, put into state.

### Risks

Custom instructions can depend on facts Jev never sees. For example,
"reference the ticket id from the branch name" needs the branch name.
The "do not apply" clause and a low threshold (0.2) keep these cases from
being flagged. Include the branch name in state when it is cheap to read.

### Validation before it ships

- Gitmoji: label the 200 tuning options by hand from the guide, then
  measure flags against those labels.
- Custom instructions: write 5 instructions (a ticket prefix, "mention
  tests", "no emoji in the body", "British spelling", a branch reference).
  Generate options with and without each, and check that compliant
  options are never flagged.

### Effort

About 30 minutes for the code, and 30 minutes to validate.

## Order of work

1. **A, autopick.** Biggest effect: every non-interactive commit gets
   better. Validate on Ollama first.
2. **E, instruction and format checks.** Small, and it rides on the same
   request as A.
3. **B, mixed-commit warning.** Same request, with a cheap experiment.
4. **C, scope and breaking change.** Its own request, and a history
   replay to validate.
5. **D, picker search.** The most UI work, and only useful with `-i`.

After each feature: run tests, typecheck and lint, run a live
end-to-end check, update the design record and README, and commit with
`git -c commit.gpgsign=false`. One PR covers the lot.

## Open questions

- Should each feature get its own toggle under `typesafe`, or is
  `enable` plus `autopickCount` enough? The plan assumes enough, because
  every feature is either non-blocking or only shapes the prompt. A toggle
  can be added if one misbehaves.
- Should autopick also run with `--dry-run`? The plan says yes: a dry run
  should print what a real run would commit.
