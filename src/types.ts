/**
 * Shared types for claude-commit.
 */

/** Which models to use for each stage of the pipeline. */
export interface ModelConfig {
  /** Model used to read diffs and write summaries. Defaults to `sonnet[1m]`. */
  summary: string;
  /** Model used to turn summaries into the final commit message. Defaults to `haiku`. */
  final: string;
}

/** Fully-resolved configuration after merging defaults, file config and CLI flags. */
export interface Config {
  /** Format the subject line as a Conventional Commit (`type(scope): description`). */
  conventionalCommits: boolean;
  /** Prefix the subject line with a gitmoji. */
  gitmoji: boolean;
  /** Produce a multi-line commit (subject + body) instead of a single subject line. */
  multiline: boolean;
  /**
   * Template for the first line. `{message}` is replaced with the generated
   * subject. Useful for ticket prefixes, e.g. `"[PROJ-123] {message}"`.
   */
  template: string | null;
  /** Extra instructions appended to the standard prompt. */
  customPrompt: string | null;
  /** How many candidate messages to generate in interactive mode. */
  interactiveCount: number;
  /**
   * Sampling temperature for the final model when generating interactive
   * options, to encourage variety between candidates. `null` leaves the model
   * at its default. Only applied in interactive mode.
   */
  interactiveTemperature: number | null;
  /** Models for each pipeline stage. */
  models: ModelConfig;
  /**
   * Approximate maximum number of tokens of diff to send to the summary model
   * in a single request. Diffs larger than this are split across requests.
   */
  maxChunkTokens: number;
  /** Approximate characters-per-token ratio used for chunk-size estimation. */
  charsPerToken: number;
  /**
   * Allow API credentials from the environment (`ANTHROPIC_API_KEY` /
   * `ANTHROPIC_AUTH_TOKEN`) to be used, billing pay-as-you-go instead of the
   * Claude subscription. When false (the default) those variables are
   * stripped from the environment passed to the Claude Agent SDK subprocess,
   * so an exported key can never silently switch billing.
   */
  allowApiKey: boolean;
}

/** Partial config as it may appear in a config file or be produced by flags. */
export type PartialConfig = {
  [K in keyof Config]?: K extends "models" ? Partial<ModelConfig> : Config[K];
};

/** Result of a single model invocation. */
export interface ModelResult {
  /** The text the model produced. */
  text: string;
  /** Cost of the call in USD, if reported. */
  costUsd: number;
  /** The model that actually served the request, if reported. */
  model?: string;
  /** Parsed structured output, when a JSON-schema `outputFormat` was requested. */
  structured?: unknown;
}

/** A staged change as seen by `git`. */
export interface FileChange {
  /** Status code from `git diff --name-status` (e.g. `A`, `M`, `D`, `R100`). */
  status: string;
  /** Path of the file (the destination path for renames). */
  path: string;
}
