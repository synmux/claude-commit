/**
 * The commit-message pipeline:
 *
 *   diff ──split──▶ [chunk, chunk, ...] ──summary model──▶ [summary, ...]
 *        ──final model──▶ commit message(s)
 *
 * The summary model (default `sonnet[1m]`) reads each diff chunk and writes a
 * factual summary; chunking keeps each request within the model's context
 * window. The final model (default `haiku`) turns the summaries into the commit
 * message(s), applying the configured formatting rules.
 */
import { runPrompt } from "./agent";
import { splitDiff } from "./diff";
import { tokensToChars } from "./tokens";
import { ClaudeCommitError } from "./errors";
import {
  buildFinalSystem,
  buildFinalUser,
  buildSummarySystem,
  buildSummaryUser,
  cleanMessage,
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

/** Run the full pipeline over a staged diff. */
export async function generateCommit(
  diff: string,
  config: Config,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const { count = 1, progress = {}, abortController } = options;

  const maxChars = tokensToChars(config.maxChunkTokens, config.charsPerToken);
  const chunks = splitDiff(diff, maxChars);
  if (chunks.length === 0) {
    throw new ClaudeCommitError("There are no staged changes to summarize.");
  }

  // Stage 1: summarize each chunk.
  const summarySystem = buildSummarySystem();
  const summaries: string[] = [];
  let costUsd = 0;

  for (let i = 0; i < chunks.length; i++) {
    progress.onPhase?.(
      chunks.length > 1
        ? `Reading diff (part ${i + 1}/${chunks.length})`
        : "Reading diff",
    );
    const result = await runPrompt(
      buildSummaryUser(chunks[i]!, i, chunks.length),
      {
        model: config.models.summary,
        system: summarySystem,
        ...(abortController ? { abortController } : {}),
      },
    );
    summaries.push(result.text);
    costUsd += result.costUsd;
  }

  // Stage 2: write the commit message(s) from the summaries.
  progress.onPhase?.(
    count > 1 ? "Writing commit options" : "Writing commit message",
  );
  const finalPrompt = buildFinalUser(summaries, count);
  const finalOpts = {
    model: config.models.final,
    system: buildFinalSystem(config),
    ...(progress.onText ? { onText: progress.onText } : {}),
    ...(abortController ? { abortController } : {}),
  };
  // Bump the temperature when producing several options, for more variety.
  // Some models reject a temperature override, so fall back to the default.
  const useTemperature = count > 1 && config.interactiveTemperature != null;
  let finalResult;
  if (useTemperature) {
    try {
      finalResult = await runPrompt(finalPrompt, {
        ...finalOpts,
        temperature: config.interactiveTemperature!,
      });
    } catch {
      finalResult = await runPrompt(finalPrompt, finalOpts);
    }
  } else {
    finalResult = await runPrompt(finalPrompt, finalOpts);
  }
  costUsd += finalResult.costUsd;

  const messages =
    count > 1
      ? dedupe(parseOptions(finalResult.text).map(cleanMessage))
      : [cleanMessage(finalResult.text)];

  const cleaned = messages.filter((m) => m.length > 0);
  if (cleaned.length === 0) {
    throw new ClaudeCommitError("The model did not produce a commit message.");
  }

  return { messages: cleaned, summaries, chunkCount: chunks.length, costUsd };
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
