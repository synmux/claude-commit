# `claude-commit`

Generate high-quality git commit messages with Claude - using your **Claude Code
subscription**, not an API key.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/synmux/claude-commit)

> [!NOTE]
> `claude-commit` has a sense of fun. It's always asking its environment whether it's `PARTY_TIME` on startup.
>
> Do with that information what you will.

`claude-commit` reads your staged diff, has a strong model summarize it, and a fast
model turn that summary into a well-formed commit message. It handles diffs of any
size (including ones too large to fit in a single context window), and supports
Conventional Commits, gitmoji, first-line templates, custom instructions, and an
interactive mode for choosing between several options.

```console
$ cco -c
✔ Committed
feat(auth): add error handling and refresh token rotation to login
```

## How it works

```plaintext
staged diff ──ignore──▶ ──split──▶ [chunk, …] ──sonnet──▶ summaries ──sonnet──▶ commit message
```

1. **Summarize** - the diff is split into chunks that fit the context window and
   each chunk is summarized by a strong model (`sonnet`, which carries a native
   1M-token context). Diffs larger than 1M tokens simply produce more chunks.
   Paths listed in [`ignore`](#ignoring-paths-entirely) are dropped first and
   never read at all; changes under configured
   [low-priority paths](#low-priority-paths) are summarized separately, so churn
   cannot crowd out the code.
2. **Write** - the summaries are handed to the same model (`sonnet`) to write the
   final commit message according to your formatting rules. The message is the
   whole point of the tool, and its input is tiny, so a strong model here costs
   almost nothing extra.

Both stages go through the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).

For less model work at the cost of less useful messages, enable
[`filenamesOnly`](#filenames-only-mode) to skip summarisation entirely.

## Install

Requires [Node.js](https://nodejs.org) 26.11 or later.

```sh
npm install -g @synmux/claude-commit   # `cco` and `claude-commit` on your PATH
```

From a checkout, [pnpm](https://pnpm.io) is the package manager (the
`packageManager` field pins the version, so `corepack enable` is enough):

```sh
pnpm install
pnpm link --global  # makes `cco` and `claude-commit` available on your PATH
```

Or run it directly without linking:

```sh
node bin/cco.js --help
```

## Authentication

`claude-commit` uses the Claude Agent SDK and, by default, always authenticates
with your Claude Code subscription session (run `claude login` once). Usage is
bundled with your Claude Code usage - no separate API bill.

To protect you from surprise pay-as-you-go charges, API credentials in your
environment (`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`) are **ignored by
default**: they are stripped from the environment passed to the model
subprocess, and a one-line notice is printed to stderr. To bill an API key
instead (pay-as-you-go), opt in explicitly in your configuration:

```json
{ "allowApiKey": true }
```

## Usage

```sh
cco [options]
```

By default `cco` summarizes your **staged** changes, generates a message, shows it,
and asks for confirmation before committing. Pass `-y` to skip the prompt, or
`--dry-run` to print the message without committing. Answering `n`, or
pressing Ctrl-C or Ctrl-D at the prompt, aborts with "Aborted. Nothing was
committed." and exit code 1. Choosing `e` opens the message in your editor
(`$GIT_EDITOR`, `$VISUAL` or `$EDITOR`); an editor that exits with an
error or is killed by a signal aborts the commit too.

### Options

| Flag                                     | Description                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `-i, --interactive` / `--no-interactive` | Choose between several options in an interactive picker, or skip it when enabled in config |
| `-n, --count <n>`                        | Number of options to generate in interactive mode (default 3)                              |
| `-a, --all`                              | Stage all changes (`git add -A`) before committing                                         |
| `-c, --conventional`                     | Format as a [Conventional Commit](https://www.conventionalcommits.org)                     |
| `-g, --gitmoji`                          | Prefix the subject with a [gitmoji](https://gitmoji.dev)                                   |
| `-m, --multiline` / `--no-multiline`     | Write a multi-line commit (subject + body), or force a single line                         |
| `-t, --template <tpl>`                   | Template for the first line, e.g. `"[PROJ-1] {message}"`                                   |
| `-p, --prompt <text>`                    | Extra instructions appended to the prompt                                                  |
| `-f, --filenames-only`                   | Skip summarisation and send only filenames to the final model                              |
| `--model-summary <model>`                | Model used to summarize the diff (default `sonnet`)                                        |
| `--model-final <model>`                  | Model used to write the message (default `sonnet`)                                         |
| `--skip-armored`                         | Omit armored/encoded lines (age/gpg armor, base64 blobs) from the summarized diff          |
| `--no-low-priority-paths`                | Ignore `lowPriorityPaths` for this run, so every change weighs the same                    |
| `--no-ignore`                            | Disregard `ignore` for this run, so every staged change is read                            |
| `--typesafe` / `--no-typesafe`           | Check and rank interactive options with TypeSafe, or skip the check when enabled in config |
| `-d, --dry-run`                          | Print the message to stdout without committing                                             |
| `-y, --yes`                              | Commit without asking for confirmation                                                     |
| `--no-spinner`                           | Disable the progress spinner                                                               |
| `--config <path>`                        | Path to a config file                                                                      |
| `-v, --verbose`                          | Print summaries, cost and debug output                                                     |

### Examples

```sh
cco                      # generate, confirm, and commit staged changes
cco -a -c                # stage everything and write a Conventional Commit
cco -c -g -m             # conventional + gitmoji + a body
cco -i -n 5              # pick from 5 options interactively
cco -f --dry-run         # generate from filenames only, without committing
cco --dry-run | cat      # print a message without committing (no picker, pipe-safe)
git commit -F <(cco -d)  # use the message with your own git invocation
```

In a pipe (no TTY) there is no spinner and no confirmation prompt - `cco` just
generates and commits (or prints, with `--dry-run`).

## Filenames-only mode

Set `"filenamesOnly": true` in any config layer, or pass `-f` /
`--filenames-only`, to send only the list of filenames touched by staged
changes to `models.final`. The default is `false`.

```json
{ "filenamesOnly": true }
```

The summariser is skipped entirely: no diff chunks, summary calls, or
summary-model preload. The final model receives no file contents or diff
hunks, so expect broader, less useful messages. It is instructed to describe
the affected areas without inventing specific edits or reasons for them.
Normal formatting, custom instructions and interactive options still apply.

`ignore` still removes matching file sections, and `lowPriorityPaths` still
groups and weights the remaining filenames. Renames and copies include both
paths; additions, deletions, binary files and mode changes are included.
If every staged file is ignored, generation still stops with an error.

`models.summary`, `maxChunkTokens`, `charsPerToken` and `skipArmored` have no
effect in this mode. `--verbose` reports that the summariser was skipped;
library results have an empty `summaries` array and `chunkCount: 0`.

## Interactive mode

`cco -i` opens a picker (built on [Clack](https://github.com/bombshell-dev/clack))
listing several candidate messages, each with its subject and a one-line body
preview. Use the arrow keys (or `j`/`k`) to move between options, `Enter` to commit the highlighted option, `e` to edit it
in your `$EDITOR` first, and `q`/`Esc`/`Ctrl-C` to cancel. The picker draws on
stderr, so stdout stays clean.

To make interactive mode the default without typing `-i` every time, set
`"interactive": true` in your config (see below); opt out of a single run with
`--no-interactive`. When there is no interactive terminal - in a pipe, a CI job,
or with `--dry-run` - `cco` ignores the setting and falls back to the
non-interactive flow rather than failing.

### TypeSafe candidate check

With `"typesafe": { "enable": true }` in your config (or `--typesafe`), cco
asks [TypeSafe](https://typesafe.ai)'s Jev model to check its messages:
every option before the picker opens, or the single message of a
non-interactive run. The check compares each message with the summaries
it was written from, then:

- shows a `⚠` line under an option whose subject names a change the
  summaries do not show, or that claims an edit they do not show
- flags a subject about low-priority changes when the primary changes are
  elsewhere
- flags an option that ignores your `customPrompt`, when one is set
- drops an option that says the same thing as one above it
- warns when the staged changes look like more than one commit, so you
  can split them before committing

Otherwise the options keep the order the model wrote them in. Tests
showed the model's first option beats any reordering, and a flagged
option moves to the bottom.

With TypeSafe on, plus `gitmoji` and `conventionalCommits`, cco also
checks that each gitmoji fits its type. An option such as `🔧 feat:` or
`🎨 feat:` gets a `⚠` line and moves down. Pairings the guide allows,
such as `🔒️` with any type, pass. This check runs in code, without a
request. In a non-interactive run, every warning prints on stderr before
you confirm. With TypeSafe off, none of this runs.

One check costs a fraction of a cent and takes under a second. If it
fails, cco says why and shows the options in the model's order. A failed
check never blocks a commit.

The check needs a TypeSafe API key in `$TYPESAFE_API_KEY`. To read it from
another variable, set `"typesafe.env"`, for example
`"env": "__TYPESAFE_API_KEY"`. If the check is on and the key is missing,
cco stops before it calls any model.

When on, cco sends the summaries (or file paths) and the candidate
messages to TypeSafe. It never sends diff content. The check is off by
default for that reason. It adds one request to every run, interactive
or not.

## Configuration

Configuration is layered, from lowest to highest precedence:

1. Built-in defaults.
2. **A global user config** at `~/.config/claude-commit/config.json` (or
   `$XDG_CONFIG_HOME/claude-commit/config.json`) - your personal defaults across
   every project. The `.claude-commit.json` / `.claude-commitrc.json` /
   `.claude-commitrc` names are also accepted in that directory.
3. A `claude-commit` key in the repo's `package.json`.
4. The nearest `.claude-commit.json` / `.claude-commitrc.json` / `.claude-commitrc`,
   searched from the current directory up to the repo root.
5. CLI flags.

So a global config sets your personal defaults and any project further down the
tree can override them. Note that the `config.json` name is recognised **only** in
the global directory; inside a project, use one of the dotted filenames. The same
keys are valid at every level:

```json
{
  "conventionalCommits": true,
  "gitmoji": true,
  "multiline": true,
  "template": null,
  "customPrompt": "Reference the ticket id from the branch name when present.",
  "interactive": true,
  "interactiveCount": 3,
  "spinner": "material",
  "models": {
    "summary": "sonnet",
    "final": "sonnet"
  },
  "maxChunkTokens": 600000,
  "charsPerToken": 3.5,
  "filenamesOnly": false,
  "skipArmored": false,
  "lowPriorityPaths": [],
  "ignore": [],
  "typesafe": {
    "enable": false,
    "env": "TYPESAFE_API_KEY",
    "model": "jev-1.13.0",
    "timeout": 5000
  },
  "allowApiKey": false
}
```

`typesafe` configures the [candidate check](#typesafe-candidate-check).
`env` names the variable that holds the API key. `model` is pinned because
the check's thresholds were tested against `jev-1.13.0`. `timeout` is the
wait per attempt in milliseconds (one retry follows a failure).

`spinner` chooses the progress animation: any name from the
[cli-spinners](https://github.com/sindresorhus/cli-spinners) set bundled with
[ora](https://github.com/sindresorhus/ora) (`"dots"`, `"moon"`, `"pong"`,
`"material"`, ...). Unknown names are ignored and the default
`material` is used. `--no-spinner` disables the animated spinner, but final
status lines still print.

The `material` spinner is chosen because it's fucking cool. Fight me.

`maxChunkTokens` is a cap, not a promise: at run time it is clamped to the
summary model's context window minus a fixed reserve (1M-window models such as
current Sonnet/Opus keep the full budget; Haiku, older pinned model ids, and
unrecognised models are floored at 200k), so a single chunk can never overflow
the model.

Chunk sizes come from a content-classified token estimate, not a flat
`charsPerToken` ratio: armored or encoded lines (age/gpg armor, base64 blobs,
git binary patches) tokenize at roughly **one token per character** on current
Claude models, so they are budgeted at that rate while ordinary text keeps the
configured ratio. If the backend still rejects a chunk as too long, cco
re-splits just that chunk with a halved budget and retries - the rejection is
free, so the API is the final arbiter.

`skipArmored` (or the `--skip-armored` flag) goes further and replaces each
run of armored lines with a one-line `[cco: N armored/encoded lines omitted]`
marker before summarizing. Ciphertext is unreadable to the model anyway, so
this is the recommended setting for encrypted-file repos - for example a
[chezmoi](https://www.chezmoi.io) source directory with age encryption, where
every `chezmoi re-add` re-encrypts nondeterministically and produces megabytes
of churned armor. Drop a `.claude-commit.json` with `{ "skipArmored": true }`
in the repo root to enable it per-repo.

### Low-priority paths

Some paths change a lot without meaning much - generated docs, lockfiles,
vendored snapshots, build output. Left alone, a commit that touches twenty
lines of code and regenerates two thousand lines of tooling gets a subject
line about the tooling. `lowPriorityPaths` lists gitignore-style patterns for
those paths:

```json
{
  "lowPriorityPaths": [
    ".agents/skills/*-skilld",
    "pnpm-lock.yaml",
    "generated/**",
    "!generated/schema.ts"
  ]
}
```

Changes under matching paths are summarised separately and briefly, and the
model is told that the subject line - and the commit type, scope and gitmoji
where you use them - comes from the _other_ changes, however small they are.
The low-priority changes are mentioned in the subject only if they fit, and in
the body (with `multiline`) only after the primary changes. When _every_
changed file is low priority there is nothing for it to yield to, so the
changes are described normally, exactly as if no patterns were configured.

Pattern rules follow `.gitignore` conventions, so trunk or gitignore lines can
usually be copied in:

- A pattern with a `/` in it is anchored at the repository root and matches a
  path or any directory above it - `.agents/skills/*-skilld` covers every file
  inside each matching directory.
- A pattern without a `/` matches any path segment at any depth -
  `pnpm-lock.yaml` matches `packages/app/pnpm-lock.yaml`; `*-skilld` matches
  everything inside any `*-skilld` directory.
- `*` matches dotfiles and does not cross `/`; `**` does; `{a,b}` expands. A
  leading `/` or `./` anchors, a trailing `/` is ignored. The anchoring
  decision looks at the whole pattern, so a `/` inside a brace group anchors
  all of its alternatives - prefer one pattern per intent.
- A leading `!` negates, and the last matching pattern wins:
  `["docs/**", "!docs/adr/**"]` deprioritises docs except the ADRs.
- Patterns are always matched against repository-root-relative paths with
  `/` separators, whichever directory you run `cco` from. A backslash in a
  pattern is an escape (`\[`, `\{`, `\!` for the literal characters), so
  Windows-style `dist\**` matches nothing.
- Patterns are not validated: a typo such as an unbalanced `{` is parsed
  rather than rejected and may match something unexpected, so check the
  `--verbose` match counts when you add one.

A rename into or out of a low-priority path counts as primary (both sides
must match). The nearest config layer that sets the key wins outright - lists
are never merged - so `"lowPriorityPaths": []` in a project opts out of a
global list, and a project that wants the global patterns plus its own must
repeat them. `--no-low-priority-paths` switches the feature off for one run,
which is handy when the churn _is_ the story, or for comparing messages while
tuning patterns.

This changes how changes are _weighted_ in the message, not how much of the
diff is read: low-priority content is still summarised in full, at the same
cost. To skip content outright, see `skipArmored`. Under `--verbose`, `cco`
reports how many files matched (`low-priority paths: matched 3 of 41 files`),
which is the only way to tell a pattern that matched nothing from one that
matched everything and was promoted.

### Ignoring paths entirely

`lowPriorityPaths` still reads everything it deprioritises, and pays for it.
Some content is worth neither the tokens nor the time: a vendored dependency
tree, a generated API client, a data fixture that changes wholesale.

`ignore` takes the same gitignore-style patterns and removes those file
sections from the diff **before anything else looks at it** - before the
low-priority partition, before chunking, before any model call:

```json
{ "ignore": ["vendor/**", "**/__snapshots__", "*.generated.ts"] }
```

The stages compose in the order their names suggest:

```text
diff ─ ignore ─▶ ─ skipArmored ─▶ ─ lowPriorityPaths ─▶ chunks ─▶ summaries
```

Two things worth being clear about:

- **The files are still committed.** `ignore` governs what the model reads,
  never what git stages. `cco` is writing a message, not choosing a changeset.
- **When it matches _everything_, `cco` stops** with an error naming the
  directive, rather than inventing a message about changes you told it not to
  read. This is deliberately unlike `lowPriorityPaths`, which promotes its
  partition in the same situation - "this matters less" can degrade
  gracefully, "do not look at this" has nothing to degrade to. Pass
  `--no-ignore` for that one commit.

As with `lowPriorityPaths`, a section is dropped only when it names at least
one path and _all_ of them match, so a rename out of an ignored directory
survives. `--verbose` reports the count
(`ignore: dropped 3 of 41 files before reading`).

## Development

```sh
pnpm test            # run the test suite (vitest)
pnpm run lint:types  # tsc --noEmit
pnpm run lint        # trunk check -a (exits 1 on any finding)
pnpm run format      # prettier, then biome, then trunk fmt - in that order
pnpm run build       # bundle bin/ and index.ts into dist/ (only needed to publish)
```

To see whether a model is too slow for this machine, time it on three
synthetic commits of about 400, 8.5k and 40k tokens:

```sh
node bin/stopwatch.ts haiku
node bin/stopwatch.ts sonnet
```

It runs the real pipeline with that model in both stages, using the rest
of your config, and prints the summary, final and total time for each commit.
To try settings without touching your real config, put them under a
`claude-commit` key in a `package.stopwatch.json` at the repo root. When that
file exists, the stopwatch reads it in place of `package.json` (git ignores
it):

```json
{
  "claude-commit": { "maxChunkTokens": 24000 }
}
```

The commits are generated fresh each run, so a prompt cache cannot flatter a second run.

The sources run directly on Node's native type stripping, so there is no build
step during development: `node bin/cco.js` picks up `dist/` when it exists and
falls back to the TypeScript entry otherwise.

What changed between versions is in [CHANGELOG.md](CHANGELOG.md), and at
greater length on the
[releases page](https://github.com/synmux/claude-commit/releases).

## Did you vibe this?

I distinguish vibe coding and AI-assisted development by
_where you live as the developer_. If you live in the code, it's AI-assisted dev.
If you just shout at a chat and hope for the best, that's vibe coding.

This was AI-assisted development.

Thanks for coming to my TED talk.
