# Design: the `ignore` directive

**Date:** 2026-09-09
**Status:** Implemented

## Problem

`lowPriorityPaths` deprioritises churn; it still reads and pays for all of
it. Some content is worth neither: a vendored dependency tree, a generated
API client, a data fixture that changes wholesale. Reading it costs tokens
and time and cannot improve the message.

## Decision

`ignore: string[]` (default `[]`) takes the same gitignore-style patterns as
`lowPriorityPaths`. Matching file sections are removed from the diff before
anything else looks at it - before the low-priority partition, before
chunking, before any model call.

The pipeline stages compose in the order their names suggest:

```text
diff ─ ignore ─▶ ─ skipArmored ─▶ ─ lowPriorityPaths ─▶ chunks ─▶ summaries
```

Section-matching follows the `lowPriorityPaths` rule exactly: a section is
ignored only when it names at least one path and **every** path it names
matches, so a rename out of an ignored directory is still described.

**Ignored files are still committed.** `ignore` governs what the model
reads, never what git stages. A commit whose every file is ignored is a
commit the model has nothing to describe, so cco stops with an error naming
the directive rather than inventing a message - unlike `lowPriorityPaths`,
which promotes its partition in that case. The two behaviours differ because
the options mean different things: "this matters less" degrades gracefully,
"do not look at this" has nothing to degrade to.

`--no-ignore` disables the directive for one run, in the shape of
`--no-low-priority-paths`. `--verbose` reports the match count.

## Shared matching

`src/paths.ts` served one option and was named for it
(`createLowPriorityMatcher` / `isLowPriorityPath`). It now serves two, so
the names became `createPathMatcher` / `matchesPathPatterns`. The semantics
are unchanged.
