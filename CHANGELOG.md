# Changelog

All notable changes to `claude-commit` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each version also has a [GitHub release](https://github.com/synmux/claude-commit/releases)
carrying the same notes at greater length.

## [1.0.4] - 2026-09-11

### [1.0.4] - Added

- **Filenames-only mode.** Set `"filenamesOnly": true` in your config, or
  pass `-f` / `--filenames-only`, to skip the summariser and send only
  filenames to the final model. This reduces model work at the cost of
  broader, less useful messages; the default remains `false`.
- Filename lists retain `ignore` filtering and `lowPriorityPaths` weighting,
  including both paths of renames and copies. Formatting, templates, custom
  instructions and interactive options still apply; the model is instructed
  to avoid inventing specific edits or motivations from filenames alone.
- Verbose output identifies when the summariser was skipped. In this mode,
  library results contain an empty `summaries` array and `chunkCount: 0`,
  and the summary model is never called or preloaded.

## [1.0.3] - 2026-09-11

### Added

- **Ollama models.** Any model can run on a local or self-hosted
  [Ollama](https://ollama.com) server by prefixing its name with `ollama:`;
  everything after the prefix is the Ollama model name verbatim, tag
  included. The two pipeline stages resolve independently, so the diff can be
  summarised locally and free while the final message still goes to Claude.
  `cco` uses the native `/api/chat` endpoint rather than either compatibility
  layer, because only the native API can set a context length.
- **`ollama.context`**, defaulting to `"auto"`. Ollama truncates an oversized
  prompt silently - HTTP 200, oldest content dropped, nothing in the response
  to say so - so `cco` never lets the window stay implicit: it preloads the
  model with no window set, reads the server's own VRAM-based choice back from
  `/api/ps`, pins that number on every request, sizes chunks against it, and
  checks the returned token counts to catch a truncation that happened anyway.
  A number pins the window instead.
- **`ollama.host`** (defaults to `$OLLAMA_HOST`, then `http://localhost:11434`)
  and **`ollama.keepAlive`**, plus the `--ollama-host` and `--ollama-context`
  flags.
- **`lowPriorityPaths`.** Gitignore-style patterns for churn-heavy paths whose
  changes are summarised separately, so they cannot crowd out the code in the
  final message. The content is still read and still costs the same; only its
  weight changes. `--no-low-priority-paths` disables it for one run.
- **`ignore`.** The same pattern syntax, but matching file sections are removed
  from the diff before anything else looks at it - before the low-priority
  partition, before chunking, before any model call. The files are still
  committed; `ignore` governs what the model reads, never what git stages. When
  a pattern matches everything, `cco` stops with an error naming the directive
  rather than inventing a message about changes you told it not to read.
  `--no-ignore` disables it for one run.

### Changed

- The default spinner is now `material`.
- `@opentui/core` bumped to 0.5.7, alongside SDK and skill dependency bumps.
- CI workflows bump `checkout`, `setup-node` and `claude-code-action`.

## [1.0.2] - 2026-07-27

### [1.0.2] - Changed

- The default spinner is now `dwarfFortress` instead of `bouncingBall`.

## [1.0.1] - 2026-07-27

### [1.0.1] - Added

- **A configurable spinner.** The `spinner` config key accepts any name from
  the [cli-spinners](https://github.com/sindresorhus/cli-spinners) set bundled
  with [ora](https://github.com/sindresorhus/ora). Unknown names fall back to
  the default rather than throwing, because a cosmetic option must never be
  able to break a commit.

### [1.0.1] - Changed

- The progress spinner is an ora instance rather than a hand-rolled frame
  timer. Enablement is still decided solely by the existing TTY and
  `--no-spinner` checks - ora's own CI auto-detection is bypassed - and a final
  success or failure line still prints when the animation is disabled.

## [1.0.0] - 2026-07-24

### [1.0.0] - Added

- **`--skip-armored`** and the matching `skipArmored` config key, replacing
  each run of armoured or encoded lines with a short marker. Runs of one or two
  lines survive, because a lone URL or hash is content. Ciphertext is
  unreadable to the model and re-encrypts nondeterministically on every
  `chezmoi re-add`, so this is the recommended mode for repos holding encrypted
  files.

### [1.0.0] - Fixed

- **Chunks are sized by real token density.** `Prompt is too long` returned,
  and the isolation fix in 0.1.3 turned out to have treated a symptom. Armoured
  and base64 content tokenises at roughly 1.14 chars per token on current
  Claude models, while chunk budgets assumed the configured `charsPerToken` of
  3.5: a 1,247,318-character diff was estimated at ~356k tokens and really
  counted ~1.19M. Long unbroken runs are now priced at their own, much denser
  ratio. A third-party "real tokeniser" would not fix this class of bug -
  tiktoken-style vocabularies compress base64 about three times better than
  Claude's actual tokeniser, so they underestimate the same way.
- **The summary stage is a work queue.** If the backend rejects a chunk anyway
  (its rejection is free, unbilled, and the only authoritative count), the
  budget is halved, that chunk is re-split, and processing continues in place.

### [1.0.0] - Changed

- The 0.1.3 documentation blaming these failures on MCP/skill leakage is
  corrected. That isolation stays as hygiene and cost control, but density was
  the bug.

## [0.1.4] - 2026-07-23

### [0.1.4] - Fixed

- `cco --version` reported a hardcoded string rather than the installed package
  version.

## [0.1.3] - 2026-07-23

### [0.1.3] - Fixed

- **Requests no longer inherit your global Claude Code context.** Runs failed
  reporting ~1,149k tokens against a conversation of only ~301k; the missing
  ~848k were MCP tool definitions and skills pulled from the user's global
  configuration into what should be an isolated prompt-in, text-out request.
  The Agent SDK gates each context source separately, and `settingSources: []`
  disables only settings files and `CLAUDE.md` - MCP servers and plugins load
  regardless, and the CLI performs skill discovery even when the `skills`
  option is omitted. Every switch is now set explicitly in one tested
  `buildQueryOptions()`.
- **The chunk budget is clamped to the summary model's context window.**
  `maxChunkTokens` was converted straight into a character budget regardless of
  the configured model, so on any 200k-context model a single chunk could
  exceed the whole window. It is now a cap rather than a promise, clamped to
  the model's window minus a 32k reserve.

### [0.1.3] - Added

- npm publishing on version tags via CI.

## [0.1.2] - 2026-07-09

### [0.1.2] - Changed

- **Both pipeline stages default to `sonnet`.** The final stage's input is a
  handful of summaries and its output is the entire point of the tool, so a
  strong model there costs almost nothing and writes a visibly better message.

### [0.1.2] - Added

- MIT licence.

## [0.1.1] - 2026-07-02

### [0.1.1] - Changed

- Minor tweaks.

## [0.1.0] - 2026-07-02

The first release, published as `@synmux/claude-commit` and providing the `cco`
and `claude-commit` binaries.

### [0.1.0] - Added

- **The two-stage pipeline.** The diff is split into chunks that fit the
  context window, each chunk is summarised, and the summaries are handed back
  to a model to write the final message. Diffs too large for a single context
  window simply produce more chunks.
- **Message formatting.** Conventional Commits (`-c`), gitmoji (`-g`),
  multi-line subject and body (`-m`), a first-line template (`-t`), and
  free-form extra instructions (`-p`).
- **Interactive mode.** `cco -i` lists candidate messages in a TUI, generated
  at a higher temperature for variety, with the scrollable diff alongside.
- **Layered configuration.** Built-in defaults, a global user config, a
  `claude-commit` key in the repo's `package.json`, the nearest dotted config
  file, then CLI flags.
- **Structured output.** The final message is requested as JSON against a
  `{ messages: string[] }` schema rather than parsed out of free-form text,
  degrading to a temperature-free request and then to delimiter parsing.
- **`allowApiKey`, defaulting to false.** An exported `ANTHROPIC_API_KEY` would
  otherwise silently switch every generation from subscription auth to
  pay-as-you-go billing, because the SDK subprocess inherits `process.env`.
  Those credentials are stripped unless you opt in.

[1.0.4]: https://github.com/synmux/claude-commit/compare/1.0.3...1.0.4
[1.0.3]: https://github.com/synmux/claude-commit/compare/1.0.2...1.0.3
[1.0.2]: https://github.com/synmux/claude-commit/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/synmux/claude-commit/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/synmux/claude-commit/compare/0.1.4...1.0.0
[0.1.4]: https://github.com/synmux/claude-commit/compare/0.1.3...0.1.4
[0.1.3]: https://github.com/synmux/claude-commit/compare/0.1.2...0.1.3
[0.1.2]: https://github.com/synmux/claude-commit/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/synmux/claude-commit/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/synmux/claude-commit/releases/tag/0.1.0
