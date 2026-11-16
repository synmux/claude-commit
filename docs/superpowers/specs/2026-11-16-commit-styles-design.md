# Repository commit styles

**Date:** 2026-11-16
**Status:** Implemented.

## Problem

Fixed formatting switches cannot express a repository's existing voice, body
structure, trailers and subject conventions. Infer those conventions once from
history, keep them in a reviewable file, and apply them to every future candidate
without changing the behavior of repositories that have not opted in.

## Decisions

### Opt-in and precedence

- `models.commits` is a nullable model name, default null (off). Recommend
  `fable` for analysis. `--model-commits` is its CLI override. Explicit null in a
  higher config layer disables an inherited model; blank strings are ignored.
- `conventionalCommits`, `gitmoji` and `multiline` are nullable, default null.
  Without an active guide null retains the former false behavior. With a guide
  it emits no built-in rule for that aspect, including no default subject
  casing, imperative mood or length when conventional commits is unset.
- Explicit formatting values, templates and custom prompts override the guide.
  Negative CLI flags let users explicitly disable conventional commits, gitmoji
  and multiline output. The final prompt states the precedence and makes the
  guide mandatory for every candidate; raw-output instructions remain last.

### Setup and consent

`cli.ts` calls `commit-style.ts` after configuration, optional staging and a
non-empty staged diff, before either generation flow. Newly created guides are
therefore not staged or described by this run. Setup owns the full decision tree:

1. Null analysis model: return without validation or file access.
2. Validate the model, even if a guide exists. Failure is fatal.
3. Read a regular `COMMITS.md` in the repo root if present. Non-files are errors.
4. Otherwise ask permission through `askLine`; closed input declines. `--yes`
   authorizes creation. A non-terminal run without `--yes` skips with a note.
5. Read up to 100 non-merge messages including bodies, newest first. Empty or
   unborn history skips with a note. Analyze the messages as data, weighting
   recent conventions more heavily, and request only Markdown guide content.
6. Create exclusively with `wx`. If a file appeared meanwhile, read it instead
   of overwriting it. Never create an empty generated guide.

The guide is generation context, not a config-file key. Reading and generation
failures are visible errors rather than silently dropping requested style.
All notes, consent prompts and progress remain on stderr.

### No-generation model validation

The installed Agent SDK's `Query.supportedModels()` returns models from its
initialization result. Start an isolated streaming query with an input iterable
that waits without yielding a user message, read that catalog, then close the
query and release the input. Do not pass the configured model or send a string
prompt. Match exactly against `ModelInfo.value` or `resolvedModel` so an alias
and its canonical full wire ID both work. An unmatched name reports available
values and asks the user to fix or remove `models.commits`. Initialization failure
is a distinct cannot-verify error, never successful validation.

This uses `agent.ts`, the SDK seam, and the same environment credential gate and
context isolation as normal prompts: empty tools, skills, plugins and MCP config,
strict MCP config, no setting sources. No separate API client or credentials are
introduced. Catalog initialization may need authentication/network access; it
does not generate a response. Catalog membership is not a guarantee against
later quota, provider or service errors, and historical IDs absent from the
catalog are rejected even if a backend might still accept them.

### Model stages and boundaries

- `git.ts` owns NUL-delimited history extraction and the no-history case.
- `prompts.ts` owns analysis, summary context and mandatory final instructions.
- `commit-style.ts` owns consent, file handling and orchestration of analysis.
- `generate.ts` carries style through both summary priorities, structured and
  plain final attempts, multiple candidates and filenames-only generation.
- Interactive generation carries the same option rather than rebuilding it.
- When TypeSafe is enabled, its existing request adds a `follows_style` Noul
  question per candidate, using the custom-instruction threshold of 0.2. The
  guide is state data, not evaluator instructions. Explicit formatting values,
  subject template and custom instructions override conflicting guide rules;
  null options defer to the guide. The guide and formatting overrides are sent
  to TypeSafe only with an active guide, including an existing empty file.
  Violations carry a warning and move last like custom-instruction violations;
  they do not block a commit. Missing answers throw and are reported as failed
  checks, never passes. No extra request runs, and no-guide behavior is unchanged.
  CLI key preflight still runs before style discovery and analysis. Setup analysis
  usage is separate from the existing generation pipeline's cost total.

## Rejected

- Generate a throwaway response to validate the model: incurs usage and can
  race with generation. Initialization's model catalog already provides the seam.
- Read the guide before validation: would hide a misspelled configured model
  whenever a guide already existed.
- Implicitly create a file in non-terminal runs: consent must be explicit.
- Default the feature to `fable`: makes unrequested history analysis possible.
- Treat null as false with an active guide: built-in rules would silently defeat
  repository conventions, especially body presence and subject casing.
- Overwrite an existing guide or stage the new guide automatically: loses edits
  or changes the current commit's scope.

## Verification

Tests cover nullable config precedence, CLI negations, catalog alias/full-ID
matching, credential gating and isolation, empty/error catalogs, setup consent
and skip branches, existing files without a validation bypass, empty history,
exclusive-create races, prompt precedence and raw-output ordering, and style
propagation through both summary priorities and final fallbacks. Git history
tests use a temporary repository with bodies, a merge and more than 100 commits.
No live model or authenticated catalog call is needed for automated tests.
