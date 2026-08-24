# Design: `lowPriorityPaths` - deprioritising churn-heavy paths

**Date:** 2026-08-24
**Status:** Implemented

## Problem

Some paths in a repository change a lot without meaning much. Generated
skill docs (`.agents/skills/*-skilld/`), lockfiles, vendored snapshots and
build output can account for thousands of changed lines in a commit whose
real content is a twenty-line code change. Because the pipeline weights
everything by the diff it is given, the summaries - and therefore the commit
message, and worst of all its subject line - end up describing the churn
rather than the change.

The subject line is the most important part of a commit message. When code
changed, the subject must describe the code. The churn still belongs in the
message (a reader wants to know the lockfile moved), but further down and in
proportion to its importance - unless nothing else changed, in which case it
_is_ the change and should be described normally.

## Decision

A new configuration option, `lowPriorityPaths: string[]` (default `[]`),
lists gitignore-style glob patterns. Diff sections whose files all match form
a **low-priority partition**; everything else is the **primary partition**.
The two partitions are summarised separately - the low-priority one briefly -
and the final model is given the summaries in two labelled groups together
with a weighting rule: the subject line (and the commit type, scope and
gitmoji where those are in use) comes from the primary changes, however small
they are and however large the churn is.

When every changed file is low priority there is no primary partition, so the
low-priority partition is promoted: the pipeline behaves exactly as it does
with no patterns configured, and the message describes those changes in full.

The option changes how changes are _weighted_ in the message, not how much of
the diff is read: the low-priority partition is still sent to the summary
model in full. Skipping content outright is `skipArmored`'s job.

## Approaches considered

1. **Partition the diff by file section before chunking; summarise each
   partition with its own prompt; label the summaries for the final model**
   (chosen). Clean separation, no chance of a chunk mixing priorities, the
   low-priority summary prompt can ask for brevity, and the weighting rule
   can be stated in plain terms.
2. Annotate the diff in place (marker lines before low-priority file headers)
   and let the summary model carry the labels through - rejected: chunk
   boundaries and free-form summaries make the labels unreliable by the time
   they reach the final model.
3. Tell only the final model which paths are low priority and let it discount
   the summaries - rejected: the summaries would already be dominated by the
   churn, so the final model would have little primary signal to work from.

## Detailed design

### Config surface

- `Config` / `PartialConfig` (`src/types.ts`): `lowPriorityPaths: string[]`.
- `DEFAULT_CONFIG` (`src/config.ts`): `lowPriorityPaths: []`.
- `sanitizePartial`: a non-array value leaves the key unset; an array always
  sets it, after trimming entries and dropping non-strings and blanks - so
  `[]` is a meaningful override.
- Precedence: the usual chain (global < `package.json#claude-commit` < project
  file < flags). The nearest layer that sets the key wins **outright**; lists
  are never merged. `"lowPriorityPaths": []` in a project therefore opts out
  of an inherited global list, and a project that wants the global patterns
  plus its own must restate them. `mergeConfig` / `mergePartial` copy the
  array so a resolved config never aliases `DEFAULT_CONFIG`.
- One CLI flag, `--no-low-priority-paths`, maps to `lowPriorityPaths: []` for
  a single run. It is the escape hatch for the commit where the churn _is_
  the story, and the A/B switch for tuning patterns; it takes no value, in
  the shape of `--no-multiline` / `--no-interactive`.
- This repository's own `package.json#claude-commit` sets
  `[".agents/skills/*-skilld", ".agents/skills/skilld-lock.yaml", "bun.lock", ".serena"]`
  - the same generated paths `.trunk/trunk.yaml` ignores.

### Path matching (`src/paths.ts`, new)

Patterns follow gitignore conventions, implemented on `Bun.Glob` (no new
dependency; `*` matches dotfiles, `**` crosses directories, braces expand,
`\` escapes). `Bun.Glob.match` alone is not enough: `.agents/skills/*-skilld`
does not match `.agents/skills/ora-skilld/SKILL.md`, and `*.lock` does not
match `sub/bun.lock`. So `createLowPriorityMatcher(patterns)` compiles once
per run and applies these rules:

- The pattern is normalised first: a leading `/` or `./` anchors it and is
  stripped; trailing `/`s are stripped.
- A pattern with a `/` **remaining after that** is anchored at the
  repository root and matches when the glob matches the path **or any
  ancestor directory** of it, so a directory pattern covers everything
  beneath it.
- A pattern with no `/` remaining matches when the glob matches **any path
  segment** (the file's basename or any ancestor directory's name), so
  `bun.lock`, `*-skilld` and `node_modules/` apply at any depth.

Stripping the trailing slash before deciding anchoring is what makes
`node_modules/` - the literal line a user copies from `.gitignore` - match
`packages/app/node_modules/...` as gitignore does (deciding first would
compile `Glob("node_modules/")`, which matches nothing). The trailing slash
is accepted for familiarity only: it does **not** enforce gitignore's
directory-only rule, because a diff carries no file/directory distinction (a
deleted path cannot be stat'd), so `dist/` also matches a plain file named
`dist`, though not `dist.txt`.

- A leading `!` negates. Patterns are evaluated in order and the **last one
  that matches decides**, so `["docs/**", "!docs/adr/**"]` deprioritises
  docs except the ADRs. `\!` matches a literal leading bang. A list made only
  of negations matches nothing.
- Paths are always matched as repository-root-relative POSIX paths,
  whichever directory `cco` was invoked from (git emits `/` on every
  platform and the readers force `--no-relative`) - that is what makes
  anchored patterns such as `.agents/skills/*-skilld` well defined. The only
  path normalisation is stripping a leading `./` or `/`. A backslash reaching
  the matcher is a filename character, never a separator: git quotes a POSIX
  file named `weird\name.lock` as `"b/weird\\name.lock"`, `sectionPaths`
  unquotes it, and it must not split into `weird` + `name.lock`. In a
  _pattern_, by contrast, a backslash is a `Bun.Glob` escape (`\[`, `\{`,
  `\!`), so Windows-shaped patterns such as `dist\**` match nothing by
  design.
- The anchored/bare decision is made on the whole pattern text, so a `/`
  inside a brace group anchors every alternative (`{docs/**,bun.lock}` does
  not match `sub/bun.lock`). Prefer one pattern per intent.

`Bun.Glob` never throws on an ill-formed pattern, but it parses it rather
than rejecting it, so it does not reliably match nothing either: an
unbalanced `{` is treated as its first alternative (`{docs,build` matches
`docs` at any depth and never `build`), while an unterminated `[` matches
nothing at all. No construction-time check can catch this, and rejecting
patterns Bun accepts would be a new failure mode of its own (gitignore does
not validate either), so validation stays at "non-empty string". Instead the
matcher is made observable: `--verbose` prints how many file sections
matched (see Pipeline), which is the only way to tell "matched nothing" from
"matched something unexpected" from "matched everything and was promoted".

### Partitioning (`src/diff.ts`)

`partitionDiff(diff, isLowPriority)` returns a `DiffPartition`:
`{ primary, lowPriority, matchedFiles, totalFiles, promoted }`, where
`primary` and `lowPriority` are diff strings (file sections joined with
newlines, `""` when empty).

- File sections are the existing `diff --git` splits.
- `sectionPaths(section)` collects the paths a section touches from the
  `--- a/`, `+++ b/`, `rename from/to` and `copy from/to` lines in the
  section header (before the first `@@`, so a removed line that begins with
  two dashes and a space is never mistaken for a marker), skipping
  `/dev/null`, stripping the
  `a/`/`b/` prefix when present, unquoting C-style quoted paths (`\"`, `\\`,
  `\t`, octal `\NNN` bytes decoded as UTF-8) and trimming the tab git appends
  after an unquoted path containing spaces. Sections without those lines
  (binary patches, mode-only changes) fall back to the `diff --git a/X b/Y`
  header; git writes the same path twice there, so the split is validated by
  checking both halves agree (which also resolves a path that itself contains
  `b/` after a space), falling back to the last such separator otherwise.
- A section is low priority only when it has at least one path and **every**
  path matches - a rename into or out of a low-priority area stays primary,
  as does a preamble section with no recognisable path (which is also not
  counted in `totalFiles`).
- If the primary partition is empty, the low-priority sections are returned
  as primary, `lowPriority` is `""` and `promoted` is true.

All three staged-change readers in `src/git.ts` (`getStagedDiff`,
`getStagedFiles`, `getStagedStat`) share one flag list
(`STAGED_DIFF_FLAGS`): `--cached --no-color --no-relative --no-ext-diff
--ignore-submodules=none --submodule=short --src-prefix=a/ --dst-prefix=b/`.
The list is exhaustive, not illustrative: it neutralises every user setting
that changes the format or the membership of the staged diff.

- `--no-relative` defeats `diff.relative`, which would otherwise both strip
  leading path segments (so from `src/` the matcher would see `paths.ts`
  instead of `src/paths.ts`) _and_ omit staged files outside the invocation
  directory, so the message would describe a subset of what gets committed.
- `--no-ext-diff` defeats `diff.external` / `GIT_EXTERNAL_DIFF` / a
  gitattributes `diff=<driver>`, which replace the diff body wholesale - a
  difftastic-style driver emits no `diff --git` headers at all, leaving one
  pathless section the partitioner can never sort, and a driver that emits
  its own headers can attach a low-priority file's changes to another path.
- `--ignore-submodules=none` defeats `diff.ignoreSubmodules=all`, which
  erases a staged submodule bump from all three readers.
- `--submodule=short` defeats `diff.submodule=log|diff`, which replace a
  submodule's `diff --git` section with a header-less `Submodule <path>
<a>..<b>:` block; having no header it would be appended to whichever
  section git emitted before it and inherit that section's priority (and be
  missing from `totalFiles`). With the flag every top-level block is a
  `diff --git` section, which is the premise the section splitter relies on.
- The forced prefixes defeat `diff.noprefix` / `diff.mnemonicPrefix`; the
  parser still tolerates their absence for diffs supplied programmatically.

`* Unmerged path` lines (an unresolved merge, when `git commit` refuses to
run anyway) and combined `diff --cc` output (never produced by
`git diff --cached`) are deliberately not handled.

### Pipeline (`src/generate.ts`)

`generateCommit` applies `skipArmored` redaction to the whole diff first,
then partitions it. The summary stage is `summarizePartition(diff, priority,
options)`, which owns the chunking and overflow-retry queue exactly as before
and returns `DiffSummary[]` plus cost; chunk numbering ("part 2 of 3") is
per partition. The primary partition is summarised first (fail fast on the
part that matters), then the low-priority partition when it is non-empty.
`chunkCount` is the total.

`GenerateResult.summaries` is `DiffSummary[]` (`{ priority, text }`, primary
first), and `GenerateResult.lowPriority` carries
`{ matchedFiles, totalFiles, promoted }`:

```ts
export type ChangePriority = "primary" | "low";
export interface DiffSummary {
  priority: ChangePriority;
  text: string;
}
```

Progress labels distinguish the partitions ("Reading diff (part 1/2)",
"Reading low-priority diff"). `--verbose` prints one line describing how the
patterns applied (`low-priority paths: matched 3 of 41 files`, `... matched
none of 41 files`, or `... matched all 41 files - nothing else changed, so
treated as primary`) and labels each summary with its priority.

### Prompts (`src/prompts.ts`)

- `buildSummarySystem(priority)`: the low-priority variant tells the model the
  content is from paths the user marked low priority (generated or vendored
  content such as tool-generated docs, lockfiles, snapshots, build output),
  asks for a brief summary - a few sentences naming which files or areas
  changed and the nature of the change - and not to describe individual
  edits. The primary variant is unchanged.
- `buildSummaryUser(chunk, index, total, priority)`: the low-priority preamble
  says so ("Summarize the following low-priority diff", "part 2 of 3 of a
  larger low-priority diff").
- `buildFinalSystem(config, structured, hasLowPriority)`: the weighting rules
  live in the **system** prompt, next to the other subject-line rules, so
  they carry the same authority; they are inserted after the subject-style,
  gitmoji and template rules and before the body rule, and every clause is
  branched on the config exactly as those rules are:
  - always: the summary is in two groups and the primary changes are what
    the commit is about; the subject line describes the primary changes
    however small or routine they are and however many files or lines the
    low-priority changes touch - a one-line primary change still owns the
    subject; if the primary changes seem too small to fill a subject, write
    a short subject about them anyway rather than padding with the
    low-priority changes; mention the low-priority changes in the subject
    only if they fit naturally without displacing anything primary;
  - `conventionalCommits`: choose the type and scope from the primary changes
    alone;
  - `gitmoji`: choose the gitmoji from the primary changes alone;
  - `multiline`: the body rule gains "cover the primary changes first and in
    full, then reference the low-priority changes briefly after them";
    single-line mode keeps "Output only the single subject line" untouched.
    With one partition the system prompt is byte-identical to before.
- `buildFinalUser(summaries, count, structured)`: with both groups present the
  summaries are labelled "Primary changes" and "Low-priority changes",
  primary first, followed by a one-line anchor ("The subject line is about
  the primary changes above.") - the user turn carries the data, not the
  rules. The multi-option instruction, which is the last thing the model
  reads, scopes its variety axis to "which aspect of the primary changes"
  each option emphasises and restates that each option's subject describes
  the primary changes; with one group its wording is unchanged.

### Documentation

- README: the config key in the sample, a section on semantics (ancestor and
  segment rules, negation, anchoring, replace-not-merge and the `[]` opt-out,
  the promotion rule, "weighting, not cost"), the `--no-low-priority-paths`
  flag in the options table, and the `--verbose` line.
- WALKTHROUGH: repository map (`src/paths.ts`), pipeline diagram and prose
  with the partition step, configuration defaults, prompts, git adapter
  flags, CLI flag.
- `.agents/skills/verify/SKILL.md`: how to exercise the weighting end to end.
- Serena `project_overview` memory.

### Testing (`bun test`)

- `test/paths.test.ts`: ancestor matching for `/` patterns, segment matching
  for bare patterns, `**` and brace patterns, the brace-anchoring limitation,
  `./`, leading and trailing `/`, backslash as a filename character, blank
  patterns, negation (re-include, order, bare patterns, negation-only lists,
  `\!`), empty inputs, and the real behaviour of ill-formed patterns
  (unbalanced `{` becomes its first alternative, unterminated `[` matches
  nothing, nothing throws) pinned against Bun upgrades.
- `test/diff.test.ts`: `sectionPaths` over real git output (added, deleted,
  rename, copy, binary, mode-only, spaces plus trailing tab, a path containing
  `b/` after a space, C-quoted and octal-escaped paths, no-prefix diffs,
  marker-like lines inside hunks, preamble); `partitionDiff` (order, content
  preserved, counts, rename needs both sides, negation, promotion, preamble,
  empty).
- `test/config.test.ts`: sanitisation (including `[]` kept), default,
  replacement not merge, inheritance, copy semantics, file loading.
- `test/prompts.test.ts`: low-priority summary prompts; `buildFinalSystem`
  unchanged without the flag, size-independent rule with it, config-branched
  clauses present/absent, ordering; `buildFinalUser` grouping, anchor, scoped
  multi-option wording, unchanged single-group wording.
- `test/generate.test.ts`: stub runner sees primary chunks first with the
  primary system prompt and low-priority chunks after with theirs; summaries
  carry priorities; promotion; progress labels; overflow retry inside the
  low-priority partition; `skipArmored` before partitioning; statistics.
- `test/git.test.ts`: a real temporary repository with a staged submodule
  and `diff.relative`, `diff.noprefix`, `diff.mnemonicPrefix`,
  `diff.submodule=log`, `diff.ignoreSubmodules=all` and a header-forging
  `diff.external` driver all on, read from a subdirectory - every reader
  still returns the whole staged set with `a/`/`b/` prefixes, the submodule
  keeps its own `diff --git` section, and the external driver never runs.
- `test/cli.test.ts`: `--no-low-priority-paths` parsing and mapping; the
  verbose statistics line.

## Error handling

One new failure mode: an ill-formed or over-broad pattern can silently
deprioritise the wrong files. It cannot throw or drop content - the
low-priority partition is still summarised in full and reaches the final
model, and promotion covers the everything-matched case - so the impact is a
de-emphasised section of the message. `--verbose` prints the match counts
(`describeLowPriorityStats`), so a pattern that matched nothing, matched
something unexpected, or matched everything is distinguishable. An empty
partition is skipped, never sent to the model.

## Compatibility

**Breaking change (intentional):** `GenerateResult.summaries` changes from
`string[]` to `DiffSummary[]`, `GenerateResult` gains `lowPriority`,
`buildSummarySystem` / `buildSummaryUser` / `buildFinalSystem` gain
priority-aware parameters and `buildFinalUser` takes `DiffSummary[]`. No
migration shim. CLI behaviour with no `lowPriorityPaths` configured is
unchanged apart from the diff readers pinning `--no-relative` and the
`a/`/`b/` prefixes.
