Allow configuration to set low-priority paths. The intention is that paths like .agents/skills/*-skilld will represent
large changes, but should be deprioritised when generating a commit message because code changes are more meaningful -
even though in terms of lines changed the skill churn might be significant. I say "deprioritised" because if there
aren't other changes then sure, the skill changes should be the bulk of the commit message, but if there are code
changes those are more important. There might be other paths that are low priority, hence the idea for setting
deprioritised paths in the configuration. `claude-commit` should then make a decision about what the commit message
should look like, considering that the top line is the most important part of a commit message.

Example scenario:

Thousands of lines changed in a deprioritised path. Twenty lines changed elsewhere.

Outcome:

Commit message top line mainly describes the code changes. It may mention the skill changes if there's space. The skill
changes are referenced further down in the commit message, but since they're deprioritised, the important part of the
commit - the twenty lines of code change - are what the bulk (or all) of the top line describes.
