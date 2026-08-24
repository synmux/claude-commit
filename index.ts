/**
 * Library entry point for `claude-commit`.
 *
 * Re-exports the building blocks so the commit-message pipeline can be used
 * programmatically. The CLI lives in `bin/cco.ts` (`src/cli.ts`).
 */
export { generateCommit } from "./src/generate";
export type {
  GenerateOptions,
  GenerateProgress,
  GenerateResult,
  LowPriorityStats,
} from "./src/generate";
export { runPrompt } from "./src/agent";
export type { RunPromptOptions } from "./src/agent";
export { partitionDiff, sectionPaths, splitDiff } from "./src/diff";
export type { DiffPartition } from "./src/diff";
export { createLowPriorityMatcher, isLowPriorityPath } from "./src/paths";
export type { PathMatcher } from "./src/paths";
export {
  DEFAULT_CONFIG,
  loadFileConfig,
  resolveConfig,
  mergeConfig,
  mergePartial,
  sanitizePartial,
} from "./src/config";
export {
  buildSummarySystem,
  buildSummaryUser,
  buildFinalSystem,
  buildFinalUser,
  parseOptions,
  cleanMessage,
} from "./src/prompts";
export * as git from "./src/git";
export { ClaudeCommitError } from "./src/errors";
export type {
  ChangePriority,
  Config,
  DiffSummary,
  ModelConfig,
  PartialConfig,
  ModelResult,
  FileChange,
} from "./src/types";
