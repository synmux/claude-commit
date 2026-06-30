# `claudecommit`

Invoked as `cc` or `claudecommit`

Uses Claude Agents SDK to generate a commit message. Capable of handling large diffs managing context appropriately
(including diffs which don't fit in context).

Can be configured to use conventional-commits and gitmoji.

Can be configured to use a template for the first line of the commit.

Can be configured with a custom prompt to be suffixed to the standart prompt.

Can be configured to write a multi-line commit or just a single line.

Uses sonnet[1m] to process diffs, write a summary, which then is processed by haiku to generate the final commit
message.

If diffs extend past the 1M context barrier, we invoke another sonnet[1m] to process the next 1M, and so on until we're
done.

The summaries are then used by haiku to generate the final commit message.

If we're using the Agent SDK we should be able to auth against Claude in a browser session rather than relying on an API
key. This would put usage bundled with our Claude Code usage.

Write in TypeScript. The Agents SDK exists for TypeScript (<https://code.claude.com/docs/en/agent-sdk/overview>). Use
Commander.js for arg parsing. Use OpenTUI for the TUI.

Two modes I can think of. The first is the non-interactive mode. Optional TUI; if in a pipe, no TUI. Otherwise, read-only TUI showing spinners or other progress indicatorswhile the commit generates and the returning. Generate commit message, commit.

The second is the interactive mode with OpenTUI. Show the diff, show multiple commit message options, allow the user to
select one. We'll probably want to bump the temperature of the model in this mode to get more variety in the commit
messages. We'll also want to allow the user to edit the commit message before committing.

I have initialised an environment with `bun init`. Use Bun for package management, running the code, and tests. Feel
free to bring in other higher-level test frameworks like Vitest if there's value.
