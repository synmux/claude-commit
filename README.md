# `claude-commit`

Generate high-quality git commit messages with Claude — using your **Claude Code
subscription**, not an API key.

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

Want more details? See [WALKTHROUGH.md](WALKTHROUGH.md).

```plaintext
staged diff ──split──▶ [chunk, …] ──sonnet[1m]──▶ summaries ──haiku──▶ commit message
```

1. **Summarize** — the diff is split into chunks that fit the context window and
   each chunk is summarized by a strong model (`sonnet[1m]`, Sonnet with a 1M-token
   context). Diffs larger than 1M tokens simply produce more chunks.
2. **Write** — the summaries are handed to a fast model (`haiku`) that writes the
   final commit message according to your formatting rules.

Both stages run through the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).

## Install

Requires [Bun](https://bun.sh).

```sh
bun install
bun link            # makes `cco` and `claude-commit` available on your PATH
```

Or run it directly without linking:

```sh
bun run bin/cco.ts --help
```

## Authentication

`claude-commit` uses the Claude Agent SDK and, by default, always authenticates
with your Claude Code subscription session (run `claude login` once). Usage is
bundled with your Claude Code usage — no separate API bill.

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
`--dry-run` to print the message without committing.

### Options

| Flag                                     | Description                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `-i, --interactive` / `--no-interactive` | Choose between several options in an interactive TUI, or skip it when enabled in config |
| `-n, --count <n>`                        | Number of options to generate in interactive mode (default 3)                           |
| `-a, --all`                              | Stage all changes (`git add -A`) before committing                                      |
| `-c, --conventional`                     | Format as a [Conventional Commit](https://www.conventionalcommits.org)                  |
| `-g, --gitmoji`                          | Prefix the subject with a [gitmoji](https://gitmoji.dev)                                |
| `-m, --multiline` / `--no-multiline`     | Write a multi-line commit (subject + body), or force a single line                      |
| `-t, --template <tpl>`                   | Template for the first line, e.g. `"[PROJ-1] {message}"`                                |
| `-p, --prompt <text>`                    | Extra instructions appended to the prompt                                               |
| `--model-summary <model>`                | Model used to summarize the diff (default `sonnet[1m]`)                                 |
| `--model-final <model>`                  | Model used to write the message (default `haiku`)                                       |
| `-d, --dry-run`                          | Print the message to stdout without committing                                          |
| `-y, --yes`                              | Commit without asking for confirmation                                                  |
| `--no-spinner`                           | Disable the progress spinner                                                            |
| `--config <path>`                        | Path to a config file                                                                   |
| `-v, --verbose`                          | Print summaries, cost and debug output                                                  |

### Examples

```sh
cco                      # generate, confirm, and commit staged changes
cco -a -c                # stage everything and write a Conventional Commit
cco -c -g -m             # conventional + gitmoji + a body
cco -i -n 5              # pick from 5 options interactively
cco --dry-run | cat      # print a message without committing (TUI-free, pipe-safe)
git commit -F <(cco -d)  # use the message with your own git invocation
```

In a pipe (no TTY) there is no spinner and no confirmation prompt — `cco` just
generates and commits (or prints, with `--dry-run`).

## Interactive mode

`cco -i` opens a TUI listing several candidate messages to choose from. The
options are generated with a higher temperature (`interactiveTemperature`) for
more variety. Use the arrow keys to move between options, `Enter` to commit the
highlighted option, `e` to edit it in your `$EDITOR` first, and `q`/`Esc` to
cancel.

To make interactive mode the default without typing `-i` every time, set
`"interactive": true` in your config (see below); opt out of a single run with
`--no-interactive`. When there is no interactive terminal — in a pipe, a CI job,
or with `--dry-run` — `cco` ignores the setting and falls back to the
non-interactive flow rather than failing.

## Configuration

Defaults can be set in a `.claude-commit.json` (searched from the current directory
up to the repo root) or under a `claude-commit` key in `package.json`. CLI flags
always win.

```json
{
  "conventionalCommits": true,
  "gitmoji": false,
  "multiline": false,
  "template": null,
  "customPrompt": "Reference the ticket id from the branch name when present.",
  "interactive": false,
  "interactiveCount": 3,
  "interactiveTemperature": 1,
  "models": {
    "summary": "sonnet[1m]",
    "final": "haiku"
  },
  "maxChunkTokens": 600000,
  "charsPerToken": 3.5,
  "allowApiKey": false
}
```

## Development

```sh
bun test          # run the test suite
bun run typecheck # tsc --noEmit
```
