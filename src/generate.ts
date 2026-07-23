/**
 * The commit-message pipeline:
 *
 *   diff ──split──▶ [chunk, chunk, ...] ──summary model──▶ [summary, ...]
 *        ──final model──▶ commit message(s)
 *
 * The summary model (default `sonnet`) reads each diff chunk and writes a
 * factual summary; chunks are sized by a content-classified token estimate
 * (`splitDiffToFit`) so each request fits the model's context window, and a
 * chunk the backend still rejects as too long is re-split with a halved
 * budget and retried - the rejection happens before the model runs and is
 * not billed, so the API acts as the final arbiter of token counts. The
 * final model (default `sonnet`) turns the summaries into the commit
 * message(s), applying the configured formatting rules.
 */
import { runPrompt } from "./agent";
import { redactOpaqueRuns, splitDiffToFit } from "./diff";
import { clampChunkTokens } from "./tokens";
import { ClaudeCommitError, isPromptTooLongError } from "./errors";
import {
  buildFinalSystem,
  buildFinalUser,
  buildSummarySystem,
  buildSummaryUser,
  cleanMessage,
  extractMessages,
  MESSAGES_SCHEMA,
  parseOptions,
} from "./prompts";
import type { Config } from "./types";

export interface GenerateProgress {
  /** Called when a new phase of work begins (for spinner labels). */
  onPhase?: (label: string) => void;
  /** Receives streamed text of the final message as it is produced. */
  onText?: (delta: string) => void;
}

export interface GenerateOptions {
  /** Number of candidate messages to produce (interactive mode uses > 1). */
  count?: number;
  progress?: GenerateProgress;
  abortController?: AbortController;
  /**
   * Model runner used for every prompt; injectable so tests can exercise the
   * pipeline (including overflow retries) without real model calls.
   * Defaults to {@link runPrompt}.
   */
  runner?: typeof runPrompt;
}

export interface GenerateResult {
  /** Candidate commit messages (length 1 in non-interactive mode). */
  messages: string[];
  /** The intermediate summaries (useful for `--verbose`). */
  summaries: string[];
  /** Number of diff chunks the summary stage processed. */
  chunkCount: number;
  /** Total cost across all model calls, in USD. */
  costUsd: number;
}

/**
 * Floor for overflow-retry halving. Below this a chunk is essentially
 * prompt-sized already, so a "prompt is too long" rejection indicates
 * something other than chunk sizing and is surfaced instead of retried.
 */
const MIN_RETRY_CHUNK_TOKENS = 8_000;

/** Run the full pipeline over a staged diff. */
export async function generateCommit(
  diff: string,
  config: Config,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const {
    count = 1,
    progress = {},
    abortController,
    runner = runPrompt,
  } = options;

  const effectiveDiff = config.skipArmored ? redactOpaqueRuns(diff) : diff;

  // The configured chunk budget is clamped to the summary model's context
  // window so a single chunk (plus prompt scaffolding and response headroom)
  // can never overflow it, whatever `maxChunkTokens` says. Chunks are sized
  // by a content-classified token estimate: opaque content (age/gpg armor,
  // binary patches) measures near 1 char/token, so a plain chars-based
  // budget underestimates armor-heavy diffs more than threefold.
  const chunkTokens = clampChunkTokens(
    config.models.summary,
    config.maxChunkTokens,
  );
  const chunks = splitDiffToFit(
    effectiveDiff,
    chunkTokens,
    config.charsPerToken,
  );
  if (chunks.length === 0) {
    throw new ClaudeCommitError("There are no staged changes to summarize.");
  }

  // Stage 1: summarize each chunk, via a work queue so an oversized chunk
  // can be re-split and retried in place. The estimate is calibrated, but
  // only the backend knows the true token count; its "prompt is too long"
  // rejection is free, so treat it as the final arbiter: halve the budget,
  // re-split just that chunk, and continue where we left off.
  const summarySystem = buildSummarySystem();
  const summaries: string[] = [];
  let costUsd = 0;

  const queue = chunks.map((chunk) => ({ chunk, tokenBudget: chunkTokens }));
  while (queue.length > 0) {
    const task = queue.shift()!;
    const position = summaries.length;
    const total = summaries.length + queue.length + 1;
    progress.onPhase?.(
      total > 1
        ? `Reading diff (part ${position + 1}/${total})`
        : "Reading diff",
    );
    try {
      const result = await runner(
        buildSummaryUser(task.chunk, position, total),
        {
          model: config.models.summary,
          system: summarySystem,
          allowApiKey: config.allowApiKey,
          ...(abortController ? { abortController } : {}),
        },
      );
      summaries.push(result.text);
      costUsd += result.costUsd;
    } catch (error) {
      const halvedBudget = Math.floor(task.tokenBudget / 2);
      if (
        !isPromptTooLongError(error) ||
        halvedBudget < MIN_RETRY_CHUNK_TOKENS
      ) {
        throw error;
      }
      const pieces = splitDiffToFit(
        task.chunk,
        halvedBudget,
        config.charsPerToken,
      );
      if (pieces.length === 1 && pieces[0] === task.chunk) {
        // Nothing left to split on (a single oversized hunk): retrying the
        // identical request would loop forever, so surface the error.
        throw error;
      }
      queue.unshift(
        ...pieces.map((chunk) => ({ chunk, tokenBudget: halvedBudget })),
      );
    }
  }

  // Stage 2: write the commit message(s) from the summaries.
  //
  // Prefer a structured (JSON-schema) response so parsing is robust regardless
  // of how the model formats its prose. We try, in order: structured output
  // with a temperature bump (for interactive variety), then structured output
  // without it (for models that reject a temperature override), then plain text
  // with delimiter parsing (for models that don't support structured output at
  // all). Whichever succeeds first wins.
  progress.onPhase?.(
    count > 1 ? "Writing commit options" : "Writing commit message",
  );

  const baseOpts = {
    model: config.models.final,
    allowApiKey: config.allowApiKey,
    ...(abortController ? { abortController } : {}),
  };
  const temperature =
    count > 1 && config.interactiveTemperature != null
      ? config.interactiveTemperature
      : undefined;

  const attempts: Array<{ structured: boolean; temperature?: number }> = [];
  if (temperature != null) attempts.push({ structured: true, temperature });
  attempts.push({ structured: true });
  attempts.push({ structured: false });

  let messages: string[] | null = null;
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const result = await runner(
        buildFinalUser(summaries, count, attempt.structured),
        {
          ...baseOpts,
          system: buildFinalSystem(config, attempt.structured),
          ...(attempt.structured
            ? {
                outputFormat: {
                  type: "json_schema" as const,
                  schema: MESSAGES_SCHEMA,
                },
              }
            : {}),
          ...(attempt.temperature != null
            ? { temperature: attempt.temperature }
            : {}),
          ...(!attempt.structured && progress.onText
            ? { onText: progress.onText }
            : {}),
        },
      );
      costUsd += result.costUsd;
      messages = attempt.structured
        ? extractMessages(result.structured)
        : count > 1
          ? parseOptions(result.text)
          : [result.text];
      if (messages && messages.length > 0) break;
    } catch (err) {
      lastError = err;
      // If the run was cancelled, stop retrying: the shared abort signal would
      // make every remaining attempt fail immediately in the same way.
      if (abortController?.signal.aborted) break;
    }
  }

  const cleaned = (messages ?? [])
    .map(cleanMessage)
    .filter((m) => m.length > 0);
  const deduped = dedupe(cleaned);
  if (deduped.length === 0) {
    if (lastError instanceof ClaudeCommitError) throw lastError;
    throw new ClaudeCommitError("The model did not produce a commit message.");
  }

  // Report chunks actually processed: overflow retries can split further
  // than the initial estimate planned.
  return {
    messages: deduped,
    summaries,
    chunkCount: summaries.length,
    costUsd,
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}
