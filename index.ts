/**
 * Library entry point for `claude-commit`.
 *
 * Re-exports the building blocks so the commit-message pipeline can be used
 * programmatically. The CLI lives in `bin/cco.ts` (`src/cli.ts`).
 */

export type { RunPromptOptions } from './src/agent.ts'
export { runClaudePrompt, runPrompt } from './src/agent.ts'
export {
  DEFAULT_CONFIG,
  loadFileConfig,
  mergeConfig,
  mergePartial,
  resolveConfig,
  sanitizePartial
} from './src/config.ts'
export type { DiffPartition, IgnoreResult } from './src/diff.ts'
export {
  applyIgnorePatterns,
  diffPaths,
  partitionDiff,
  sectionPaths,
  splitDiff
} from './src/diff.ts'
export { ClaudeCommitError } from './src/errors.ts'
export type {
  GenerateOptions,
  GenerateProgress,
  GenerateResult,
  IgnoreStats,
  LowPriorityStats,
  OllamaContextWindow
} from './src/generate.ts'
export { generateCommit } from './src/generate.ts'
export * as git from './src/git.ts'
export type { ModelProvider, ModelRef } from './src/models.ts'
export {
  DEFAULT_OLLAMA_CONTEXT,
  DEFAULT_OLLAMA_CONTEXT_TOKENS,
  DEFAULT_OLLAMA_HOST,
  isOllamaModel,
  OLLAMA_PREFIX,
  parseModelRef
} from './src/models.ts'
export {
  probeOllamaContext,
  resolveOllamaContext,
  resolveOllamaHost,
  runOllamaPrompt
} from './src/ollama.ts'
export type { PathMatcher } from './src/paths.ts'
export { createPathMatcher, matchesPathPatterns } from './src/paths.ts'
export {
  buildFilenamesUser,
  buildFinalSystem,
  buildFinalUser,
  buildSummarySystem,
  buildSummaryUser,
  cleanMessage,
  parseOptions
} from './src/prompts.ts'
export type {
  ChangePriority,
  Config,
  DiffSummary,
  FileChange,
  ModelConfig,
  ModelResult,
  OllamaConfig,
  PartialConfig
} from './src/types.ts'
