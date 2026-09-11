/**
 * The commit-message pipeline:
 *
 *   diff ──ignore──▶ ──partition──▶ primary diff, low-priority diff
 *        ──split──▶ [chunk, chunk, ...] ──summary model──▶ [summary, ...]
 *        ──final model──▶ commit message(s)
 *
 * The `ignore` patterns run first and remove file sections outright, so
 * ignored content is never chunked, never sent and never paid for. Those
 * files are still committed - `ignore` governs what the model reads, not
 * what git stages - but when it matches *everything* there is nothing left
 * to describe and the run stops rather than inventing a message.
 *
 * The remaining diff is partitioned by the configured `lowPriorityPaths`: file
 * sections under those paths (generated docs, lockfiles, ...) form a
 * low-priority partition that is summarised after, and more briefly than,
 * the primary one, and the final model is told which is which so the
 * subject line describes the primary changes. When every file is low
 * priority the partition is promoted and the run is identical to one with
 * no patterns configured.
 *
 * The summary model (default `sonnet`) reads each diff chunk and writes a
 * factual summary; chunks are sized by a content-classified token estimate
 * (`splitDiffToFit`) so each request fits the model's context window, and a
 * chunk the backend still rejects as too long is re-split with a halved
 * budget and retried - the rejection happens before the model runs and is
 * not billed, so the API acts as the final arbiter of token counts. The
 * final model (default `sonnet`) turns the summaries into the commit
 * message(s), applying the configured formatting rules.
 * With filenamesOnly, the summary stage is skipped entirely and the final
 * model receives only paths from the filtered, priority-grouped diff.
 */
import { runPrompt } from "./agent";
import { isOllamaModel } from "./models";
import { resolveOllamaContext } from "./ollama";
import {
  applyIgnorePatterns,
  diffPaths,
  partitionDiff,
  redactOpaqueRuns,
  splitDiffToFit,
} from "./diff";
import { createPathMatcher } from "./paths";
import { clampChunkTokens } from "./tokens";
import { ClaudeCommitError, isPromptTooLongError } from "./errors";
import {
  buildFinalSystem,
  buildFinalUser,
  buildFilenamesUser,
  buildSummarySystem,
  buildSummaryUser,
  cleanMessage,
  extractMessages,
  hasLowPrioritySummaries,
  MESSAGES_SCHEMA,
  parseOptions,
} from "./prompts";
import type {
  ChangePriority,
  Config,
  DiffSummary,
  OllamaConfig,
} from "./types";

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
  /**
   * Resolves an `ollama:` model's context window, called once per model
   * per run before any chunk is sized; injectable so tests can exercise an
   * `"auto"` configuration without a server. Defaults to
   * {@link resolveOllamaContext}.
   */
  resolveOllamaContext?: typeof resolveOllamaContext;
}

/** The context window one Ollama model ran with during this run. */
export interface OllamaContextWindow {
  /** The model string as configured, prefix included. */
  model: string;
  tokens: number;
  /** Whether the number was configured or chosen by the server (`"auto"`). */
  source: "config" | "auto";
}

/** How the `ignore` patterns applied to this diff (for `--verbose`). */
export interface IgnoreStats {
  /** File sections dropped before any model saw them. */
  ignoredFiles: number;
  /** File sections in the staged diff with a recognisable path. */
  totalFiles: number;
}

/** How the `lowPriorityPaths` patterns applied to this diff (for `--verbose`). */
export interface LowPriorityStats {
  /** File sections whose paths all matched a pattern. */
  matchedFiles: number;
  /** File sections in the diff with a recognisable path. */
  totalFiles: number;
  /** Every file matched, so the changes were treated as primary after all. */
  promoted: boolean;
}

export interface GenerateResult {
  /** Candidate commit messages (length 1 in non-interactive mode). */
  messages: string[];
  /** Intermediate summaries, primary first. Empty when filenamesOnly is enabled. */
  summaries: DiffSummary[];
  /** Number of diff chunks the summary stage processed, across both partitions. */
  chunkCount: number;
  /** Total cost across all model calls, in USD. */
  costUsd: number;
  /** How the low-priority patterns applied to this diff. */
  lowPriority: LowPriorityStats;
  /** How the ignore patterns applied to this diff. */
  ignored: IgnoreStats;
  /** The context window each Ollama model ran with, in order of first use. */
  ollamaContexts: OllamaContextWindow[];
}

/**
 * Resolves each `ollama:` model's context window once and hands back an
 * {@link OllamaConfig} with the number pinned in place of `"auto"`, so the
 * runner never repeats the probe. Claude models get `undefined`: they
 * neither need nor understand the block.
 */
class OllamaContextResolver {
  private readonly windows = new Map<string, Promise<number>>();
  readonly resolved: OllamaContextWindow[] = [];

  constructor(
    private readonly config: OllamaConfig,
    private readonly resolve: typeof resolveOllamaContext,
    private readonly signal?: AbortSignal,
  ) {}

  /** The Ollama settings to run `model` with, or `undefined` for a Claude model. */
  async settingsFor(model: string): Promise<OllamaConfig | undefined> {
    if (!isOllamaModel(model)) return undefined;
    const tokens = await this.windowFor(model);
    return { ...this.config, context: tokens };
  }

  private windowFor(model: string): Promise<number> {
    let pending = this.windows.get(model);
    if (!pending) {
      pending = this.resolve(model, this.config, this.signal).then((tokens) => {
        this.resolved.push({
          model,
          tokens,
          source: this.config.context === "auto" ? "auto" : "config",
        });
        return tokens;
      });
      this.windows.set(model, pending);
    }
    return pending;
  }
}

/**
 * Floor for overflow-retry halving. Below this a chunk is essentially
 * prompt-sized already, so a "prompt is too long" rejection indicates
 * something other than chunk sizing and is surfaced instead of retried.
 */
const MIN_RETRY_CHUNK_TOKENS = 8_000;

interface PartitionSummaryOptions {
  config: Config;
  runner: typeof runPrompt;
  progress: GenerateProgress;
  contexts: OllamaContextResolver;
  abortController?: AbortController;
}

/** Spinner label for one chunk of a partition. */
function readingLabel(
  priority: ChangePriority,
  position: number,
  total: number,
): string {
  const subject = priority === "low" ? "low-priority diff" : "diff";
  return total > 1
    ? `Reading ${subject} (part ${position + 1}/${total})`
    : `Reading ${subject}`;
}

/**
 * Stage 1 for one partition: split it into chunks and summarise each, via a
 * work queue so an oversized chunk can be re-split and retried in place.
 * The estimate is calibrated, but only the backend knows the true token
 * count; its "prompt is too long" rejection is free, so treat it as the
 * final arbiter: halve the budget, re-split just that chunk, and continue
 * where we left off. Returns no summaries for an empty partition.
 */
async function summarizePartition(
  diff: string,
  priority: ChangePriority,
  options: PartitionSummaryOptions,
): Promise<{ summaries: DiffSummary[]; costUsd: number }> {
  const { config, runner, progress, contexts, abortController } = options;

  // The configured chunk budget is clamped to the summary model's context
  // window so a single chunk (plus prompt scaffolding and response headroom)
  // can never overflow it, whatever `maxChunkTokens` says. For an Ollama
  // model that window is resolved here first - possibly by asking the
  // server - so the chunks and the request agree on the same number.
  // Chunks are sized by a content-classified token estimate: opaque content
  // (age/gpg armor, binary patches) measures near 1 char/token, so a plain
  // chars-based budget underestimates armor-heavy diffs more than threefold.
  const ollama = await contexts.settingsFor(config.models.summary);
  const chunkTokens = clampChunkTokens(
    config.models.summary,
    config.maxChunkTokens,
    typeof ollama?.context === "number" ? ollama.context : undefined,
  );
  const chunks = splitDiffToFit(diff, chunkTokens, config.charsPerToken);

  const summarySystem = buildSummarySystem(priority);
  const summaries: DiffSummary[] = [];
  let costUsd = 0;

  const queue = chunks.map((chunk) => ({ chunk, tokenBudget: chunkTokens }));
  while (queue.length > 0) {
    const task = queue.shift()!;
    const position = summaries.length;
    const total = summaries.length + queue.length + 1;
    progress.onPhase?.(readingLabel(priority, position, total));
    try {
      const result = await runner(
        buildSummaryUser(task.chunk, position, total, priority),
        {
          model: config.models.summary,
          system: summarySystem,
          allowApiKey: config.allowApiKey,
          ...(ollama ? { ollama } : {}),
          ...(abortController ? { abortController } : {}),
        },
      );
      summaries.push({ priority, text: result.text });
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

  return { summaries, costUsd };
}

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
    resolveOllamaContext: resolveContext = resolveOllamaContext,
  } = options;
  const contexts = new OllamaContextResolver(
    config.ollama,
    resolveContext,
    abortController?.signal,
  );

  // Ignore first: dropped sections cost nothing downstream. Unlike a
  // low-priority partition, an ignored one has nowhere to be promoted to,
  // so matching every file is a dead end rather than a special case.
  const ignoreResult = applyIgnorePatterns(
    diff,
    createPathMatcher(config.ignore),
  );
  const ignored: IgnoreStats = {
    ignoredFiles: ignoreResult.ignoredFiles,
    totalFiles: ignoreResult.totalFiles,
  };
  if (ignoreResult.diff.trim() === "" && ignoreResult.ignoredFiles > 0) {
    throw new ClaudeCommitError(describeFullyIgnored(ignored));
  }

  const effectiveDiff =
    config.skipArmored && !config.filenamesOnly
      ? redactOpaqueRuns(ignoreResult.diff)
      : ignoreResult.diff;
  const partition = partitionDiff(
    effectiveDiff,
    createPathMatcher(config.lowPriorityPaths),
  );
  if (partition.primary.trim() === "") {
    throw new ClaudeCommitError("There are no staged changes to summarize.");
  }

  const filenames = config.filenamesOnly
    ? {
        primary: diffPaths(partition.primary),
        lowPriority: diffPaths(partition.lowPriority),
      }
    : undefined;
  const summaries: DiffSummary[] = [];
  let costUsd = 0;
  if (filenames) {
    if (filenames.primary.length + filenames.lowPriority.length === 0) {
      throw new ClaudeCommitError("There are no staged filenames to describe.");
    }
  } else {
    // Stage 1: primary first, then low priority. filenamesOnly bypasses
    // chunking, summary calls and even the summary model's context probe.
    const partitionOptions: PartitionSummaryOptions = {
      config,
      runner,
      progress,
      contexts,
      ...(abortController ? { abortController } : {}),
    };
    const primaryStage = await summarizePartition(
      partition.primary,
      "primary",
      partitionOptions,
    );
    const lowPriorityStage =
      partition.lowPriority.trim() === ""
        ? { summaries: [], costUsd: 0 }
        : await summarizePartition(
            partition.lowPriority,
            "low",
            partitionOptions,
          );
    summaries.push(...primaryStage.summaries, ...lowPriorityStage.summaries);
    if (summaries.length === 0) {
      throw new ClaudeCommitError("There are no staged changes to summarize.");
    }
    costUsd = primaryStage.costUsd + lowPriorityStage.costUsd;
  }
  const hasLowPriority = filenames
    ? filenames.primary.length > 0 && filenames.lowPriority.length > 0
    : hasLowPrioritySummaries(summaries);

  // Final stage: write the commit message(s) from summaries or filenames.
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

  const finalOllama = await contexts.settingsFor(config.models.final);
  const baseOpts = {
    model: config.models.final,
    allowApiKey: config.allowApiKey,
    ...(finalOllama ? { ollama: finalOllama } : {}),
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
        filenames
          ? buildFilenamesUser(filenames, count, attempt.structured)
          : buildFinalUser(summaries, count, attempt.structured),
        {
          ...baseOpts,
          system: buildFinalSystem(config, attempt.structured, hasLowPriority),
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
    .filter((message) => message.length > 0);
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
    lowPriority: {
      matchedFiles: partition.matchedFiles,
      totalFiles: partition.totalFiles,
      promoted: partition.promoted,
    },
    ignored,
    ollamaContexts: contexts.resolved,
  };
}

/**
 * The error for a commit whose every changed file matched `ignore`.
 *
 * There is no sensible fallback here. Describing the ignored files anyway
 * would contradict the directive the user wrote; committing an empty or
 * invented message would be worse. Naming the directive and the count makes
 * the cause obvious, because the alternative - a run that mysteriously
 * reports no staged changes when `git status` plainly disagrees - is the
 * kind of bug people spend an afternoon on.
 */
export function describeFullyIgnored(stats: IgnoreStats): string {
  const files = `${stats.ignoredFiles} staged file${stats.ignoredFiles === 1 ? "" : "s"}`;
  return (
    `Every one of the ${files} matches an "ignore" pattern, so there is ` +
    `nothing left to describe. Narrow the patterns, or pass --no-ignore to ` +
    `write a message about these changes for this commit.`
  );
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
