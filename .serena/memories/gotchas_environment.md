# Environment gotchas

## "Prompt is too long" - the REAL causes (updated 2026-07-24)

The error's wording is a trap: "this conversation is only ~X tokens - the rest is system prompt, tool definitions, and attachment content" reports a **local chars/4 estimate** as "conversation" and the API's **real count** as "the request". When the two diverge ~4x, the cause is token DENSITY, not context bloat - do not go hunting for MCP/skill leakage first.

1. **Armored/encoded diff content tokenizes at ~1 char/token** (measured live 2026-07-23: 100k chars of age armor = 87,589 tokens = 1.14 c/t; the configured `charsPerToken` 3.5 underestimates >3x). Fixed by `estimateDiffTokens`, `splitDiffToFit`, the overflow retry queue in `generate.ts`, and `--skip-armored`/`skipArmored`. Third-party tokenizers (tiktoken o200k etc.) compress base64 ~3x better than Claude's actual tokenizer, so a "real tokenizer" dependency would NOT fix this class.
2. **Broken node_modules (version skew).** Check `node_modules/@anthropic-ai/claude-agent-sdk/package.json` against `pnpm-lock.yaml`; fix with `pnpm install --frozen-lockfile`.
3. **User config leakage was suspected (2026-07-23) but never the actual cause** - probes with `buildQueryOptions` measure ~170 input tokens in any cwd.

**Probes** (recipes in `.agents/skills/verify/SKILL.md`): isolation probe reads usage from a tiny `query()` - SUM input + cache_creation + cache_read. Density probe: send a known-size armor slice, compute chars/totalInput.

## pnpm release-age policy (2026-09-13)

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`. Any install/add/remove verifies the whole lockfile against it and aborts with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` if an entry is younger than a week - including entries that got in before the policy existed. Fix: delete `pnpm-lock.yaml` and `pnpm install` fresh (never add exemptions for transitive packages). New direct deps must be ranged to a version at least a week old (e.g. Clack 1.4.3/1.7.0 when 1.5.0/1.8.0 were six days old).

## Running `cco` from inside a Claude Code session

The shell carries `CLAUDECODE=1`, `CLAUDE_CODE_*`, `CLAUDE_EFFORT`, `CLAUDE_PID`, `AI_AGENT` etc., which the spawned `claude` binary inherits. For clean end-to-end runs, scrub them:
`UNSETS=$(env | grep -oE '^(CLAUDE_CODE_[A-Z_]+|CLAUDECODE|CLAUDE_EFFORT|CLAUDE_PID|AI_AGENT)=' | sed 's/=$//' | sed 's/^/-u /' | tr '\n' ' '); env $UNSETS node bin/cco.js ...`
Note: the Claude Code Bash tool in this project runs **zsh** (chain with `&&`, not fish's `and`), despite `$SHELL` pointing at fish.

## Smoke-testing the Clack picker without a terminal

`script -q /dev/null sh -c "stty rows 24 columns 100; node <script>.mjs"` gives the prompt a real pty; pipe keystrokes into `script`'s stdin with small sleeps (`(sleep 0.5; printf '\033[B'; sleep 0.2; printf 'e') | script ...`). Without the `stty`, the pty reports 0 columns and Clack hard-wraps every character. The vitest suite covers the same paths through fake streams.

## Committing from a Claude Code session (2026-08-24)

`git commit` is SSH-signed through 1Password (`commit.gpgsign=true`, `gpg.format=ssh`, `gpg.ssh.program=.../op-ssh-sign`). From the Bash tool the signer dies with "1Password: failed to fill whole buffer" → "fatal: failed to write commit object"; the trunk pre-commit hook has already run and passed, and the index is untouched. Do NOT use `--no-gpg-sign`. Write the message to a file and ask the user to run `! git commit -F <file>`. Scratch repos for E2E runs inherit the global config: set `git config commit.gpgsign false` (and `tag.gpgsign false`) right after `git init`.

## E2E scratch-repo recipe for lowPriorityPaths

`scratchpad/e2e.sh` pattern: init repo (signing off, `diff.relative true` to prove `--no-relative`), `.claude-commit.json` with `lowPriorityPaths: ["generated/**", "pnpm-lock.yaml"]`, commit a baseline, then stage a ~20-line `src/parser.ts` fix plus regenerated `generated/docs/*.md` (3×400 lines) and a 300-line lockfile; run `cco --dry-run --no-spinner --verbose` from `src/` (subdir), then with `--no-low-priority-paths` (A/B), then with only the churn staged (promotion). Expected: `low-priority paths: matched 4 of 5 files`, subject about the parser fix, churn as a trailing "Also regenerates" paragraph; promotion case prints `matched all 4 files - nothing else changed, so treated as primary`.

## `pnpm run format` dirties generated skill docs

`prettier --write .` in the `format` script reformats `.agents/skills/*-skilld/SKILL.md` (trunk ignores those paths, prettier does not). Revert with `git checkout -- .agents/skills/*-skilld .claude/skills/*-skilld` before committing unless the churn is intended; prefer `pnpm exec prettier --write <changed files>`.

## User's install + test bed

The user previously ran live source through `bun link` (`~/.bun/bin/cco` → this repo). After the pnpm migration the equivalent is `pnpm link --global` (Node resolves the symlink to the real repo path, so type stripping still applies and no `dist/` is needed); the old Bun symlink is dead and needs replacing. Real-world armor repro: the chezmoi source repo at `~/.local/share/chezmoi`.
