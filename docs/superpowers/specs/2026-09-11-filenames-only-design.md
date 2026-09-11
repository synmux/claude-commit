# Design: filenames-only generation

**Status:** Implemented

## Behaviour

`filenamesOnly: true`, `-f` or `--filenames-only` skips the summariser and
sends only filenames to the configured final model. It defaults to false
and follows the existing config precedence. The trade-off is less model
work and less informative messages.

The pipeline still reads the staged diff locally so it can reuse the exact
ignore and priority rules, including both sides of renames and copies.
`diffPaths()` uses the shared section-header parser and deduplicates names
in encounter order. No diff hunks, contents, statistics or summaries are
sent to the final model. Filenames are JSON-quoted so unusual characters
remain inside their list items.

## Pipeline and prompts

Ignore filtering and low-priority partitioning run before filename
extraction. Fully ignored commits still fail; all-low-priority commits
still promote their files. Chunking, armoured-content redaction and all
summary calls are bypassed, including Ollama summary-model context probes.

`buildFilenamesUser()` presents the path groups and shares output-format
instructions with `buildFinalUser()`. The final system prompt describes the
limited evidence, prohibits invented edits or motivations, and retains
formatting, templates, custom instructions and priority weighting. A
requested body describes affected files or areas without inventing reasons.

The existing final-stage structured output, temperature fallback, streaming,
cancellation and deduplication paths serve both modes. Ollama final-model
context resolution and truncation checks remain in force. Results contain
`summaries: []`, `chunkCount: 0` and final-stage costs only.

## Alternatives declined

- Using a separate git name-list reader would duplicate ignore and rename
  semantics and split the library and CLI paths.
- Treating filenames as synthetic summaries would mislabel the model's
  evidence and make summary counts and verbose diagnostics misleading.
- Changing the final model's reasoning settings is unrelated to this mode;
  the saving comes from omitting diff analysis.

## Verification

Tests cover configuration and aliases, path extraction, filename quoting,
formatting, priorities, ignored changes, summary bypass, Ollama probe
selection, interactive fallbacks, streaming and empty inputs. For an
end-to-end check, run a real CLI dry-run with an unavailable summary model;
filenames-only mode should succeed using only the final model.
