# TODO

Open work, most useful first. Finished and rejected work is recorded in
`docs/superpowers/specs/` - the TypeSafe items below build on
`2026-10-19-typesafe-candidate-check-design.md`, which holds the test
methods and numbers they refer to. The bugs from the 2026-10-20 review
(items 1a-1h) are fixed; see CHANGELOG.md under "Unreleased - Fixed".

## 1. Known gaps in the shipped TypeSafe checks

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

## 2. Rejected TypeSafe ideas: what would reopen them

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

## 3. Open question

- **Per-feature toggles under `typesafe`?** Today `enable` turns
  everything on: the support checks, custom-instruction check, gitmoji
  check, duplicate removal and mixed-commit warning. That is fine while
  every part is non-blocking. Add a toggle for any part that turns out to
  misbehave.
