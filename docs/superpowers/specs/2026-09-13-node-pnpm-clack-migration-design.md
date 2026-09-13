# Node 24 + pnpm toolchain and the Clack picker

**Date:** 2026-09-13
**Status:** Implemented

## Problem

`cco` ran only on Bun. Two things tied it there: the runtime APIs used by
three modules (`Bun.Glob` in `src/paths.ts`, `Bun.$` / `Bun.spawn` in
`src/git.ts`, `Bun.file` in `src/config.ts`) and the interactive picker,
which was built on `@opentui/core`. OpenTUI is a full terminal-UI framework
with a native (Zig) renderer; on Node it needs version 26.4 or later plus
`--experimental-ffi`, and its Node support is exercised only on Linux x64.
The rest of the tool - the Claude Agent SDK, `ora`, `commander`, `fetch`
against Ollama, `node:readline` prompts - already ran on Node.

The goal: run on Node 24 LTS with pnpm as the package manager, without any
runtime flag, and keep the interactive mode.

## Decisions

### Toolchain

- **pnpm 12**, pinned through `packageManager` (Corepack reads it). The
  install policy lives in `pnpm-workspace.yaml`: `allowBuilds` replaces Bun's
  `trustedDependencies` (esbuild is on the list - it is a build-script
  package), `minimumReleaseAge: 10080` refuses anything published in the
  last week, `childConcurrency: 16` matches the old Bun concurrency.
  Consequence: `pnpm add` may resolve one minor behind npm's latest, and a
  lockfile produced before the policy existed is rejected outright - rebuild
  it from a fresh resolution rather than exempting packages.
- **Sources stay TypeScript and run unbuilt.** Node ≥ 22.18 strips types
  natively, so `node bin/cco.js` runs the checkout directly. That imposes two
  rules, both enforced by `tsc`: relative imports carry an explicit `.ts`
  extension (`allowImportingTsExtensions`), and only erasable syntax is used
  (`erasableSyntaxOnly` - the one parameter-property constructor became
  explicit fields). `package.json` is imported with `with { type: "json" }`.
- **A plain-JavaScript launcher, `bin/cco.js`.** Node refuses to strip types
  from files under `node_modules`, so the published package needs JavaScript.
  The launcher imports `dist/bin/cco.js` when it exists and `bin/cco.ts`
  otherwise. `dist/` is produced by `pnpm run build` and is only ever needed
  for publishing (`prepublishOnly`); a stale `dist/` in a checkout shadows the
  sources, which is why it is gitignored and never built implicitly.
- **esbuild** bundles both entries (`bin/cco.ts`, `index.ts`) with
  `--packages=external`; a declaration-only `tsc` pass (`tsconfig.build.json`,
  `rewriteRelativeImportExtensions`) emits `dist/types/` so the library entry
  keeps its types. `exports` exposes `.` and `./package.json` only.
- **vitest** replaces `bun:test`. `describe`/`test`/`expect` are identical;
  `spyOn` became `vi.spyOn`. The git tests spawn `git` through
  `node:child_process` instead of Bun's shell.
- **Node built-ins replace the Bun APIs.** `src/git.ts` spawns `git` with
  `spawn` and collects stdout/stderr without a cap (`execFile`'s default
  `maxBuffer` of 1 MiB is too small for a staged diff), reading the exit code
  on `close` so no trailing output is lost; the commit message is still
  piped to `git commit -F -`. `src/config.ts` uses `stat` + `readFile`.
- **picomatch** replaces `Bun.Glob` with `{ dot: true }` so `*` matches
  dotfiles as before. Backslash stays an escape and never a separator
  (`windows: false`). Every real pattern behaves identically; the two
  deliberately ill-formed patterns pinned by `test/paths.test.ts` changed and
  the tests were re-pinned to picomatch: an unbalanced `{` now matches
  nothing (Bun took the first alternative) and an unterminated `[` matches
  its literal text (Bun matched nothing). Should picomatch ever throw on a
  pattern, the pattern is kept as one that matches nothing - the matcher's
  "never throws" contract is unchanged.

### Picker

- **`@clack/core` `SelectPrompt` with a custom render**, plus glyphs and
  `limitOptions` from `@clack/prompts`. Rationale: pure JavaScript with three
  tiny dependencies, Node ≥ 20.12, per-prompt `input`/`output` streams (so the
  picker stays on stderr), a coherent visual language, and extension hooks
  (`on("key")`, prompt `state`) that make custom keys a few lines rather than
  a fork. The audit showed OpenTUI was backing exactly one select list; a
  layout engine was never justified by the usage.
- **`renderPicker()` is pure and exported.** It takes the messages, cursor,
  prompt state and output stream and returns the frame. While active it
  shows a title, a hint line, and two rows per candidate (subject behind a
  radio glyph, dimmed body preview); on submit or cancel it collapses to the
  title and the chosen subject. `limitOptions` windows the list to the
  terminal height (`rowPadding` reserves the four chrome rows,
  `columnPadding` the gutter) and marks the hidden remainder with `...`.
- **Custom keys ride the `key` event.** Clack already maps arrows, `j`/`k`,
  Enter, Escape and Ctrl-C; the handler sets `prompt.state` to `"submit"` for
  `e` (with an `edit` flag) and `"cancel"` for `q`, and Clack finalises and
  closes on whichever state a handler set. Ctrl-C resolves the cancel symbol
  and restores the terminal; it never calls `process.exit`, so the CLI's
  two-stage SIGINT handling is untouched.
- **The spinner stays on `ora`.** Clack's `spinner()` calls `block()`, which
  puts stdin in raw mode and runs `process.exit(0)` on Ctrl-C - the wrong
  exit code, and it would skip the in-flight abort. Not used.
- **The readline fallback stays.** It is a handful of lines and still the
  right answer when the prompt cannot start at all.

### Testing the picker

Clack has no first-party testing helper, but every prompt accepts its
streams. `test/interactive.test.ts` drives `selectWithPrompt()` with a
`PassThrough` input and a collecting `Writable` that carries `columns`/`rows`;
Clack only enables raw mode on real TTYs, so the fakes need nothing else. A
lone Escape needs an 80 ms wait for readline's 50 ms escape-sequence timeout.
The render function is tested directly for content, active-row marking,
truncation, and windowing.

## Rejected

- **Keep OpenTUI on Node via `--experimental-ffi`.** Forces Node ≥ 26.4 (not
  LTS until late October 2026), an experimental flag injected by the
  launcher, and Node acceptance tested only on Linux x64.
- **`@inquirer/prompts`.** A sound fallback with a first-party testing
  package, but custom keys need `createPrompt` + `useKeypress` and the look
  is less coherent with the rest of the output. Only worth it if a testing
  harness becomes a hard requirement.
- **Ink** (React - house rule), **enquirer** / **prompts** (unpublished since
  2023), **terminal-kit** (dated imperative API).
- **`path.matchesGlob`** from `node:path`: still experimental in Node 24 and
  offers no `dot` option.
- **`execFile` for git**: its `maxBuffer` cap turns a large staged diff into
  a crash; raising it to infinity is the same as buffering by hand.

## Verification

`pnpm run typecheck`, `pnpm test` (390 tests), `pnpm run build`, then
`node bin/cco.js --version` both without and with `dist/`, and an end-to-end
`--dry-run --verbose` against real staged changes (the `verify` skill).
