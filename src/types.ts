/**
 * Shared types for claude-commit.
 */

/**
 * Which models to use for each stage of the pipeline.
 *
 * Each is a Claude alias (`sonnet`, `haiku`) or a full `claude-*` id, run
 * through the Claude Agent SDK.
 */
export interface ModelConfig {
  /** Model used to read diffs and write summaries. Defaults to `sonnet`. */
  summary: string
  /** Model used to turn summaries into the final commit message. Defaults to `sonnet`. */
  final: string
}

/**
 * Settings for the TypeSafe candidate check: on every run, interactive or
 * not, TypeSafe's Jev model checks each candidate message against the
 * evidence it was written from and asks whether the staged changes look
 * like more than one commit. Doubtful candidates move last with a warning
 * and near-duplicates are dropped. See `src/typesafe.ts`.
 */
export interface TypeSafeConfig {
  /** Run the check. Off by default: it sends summaries and candidates to TypeSafe. */
  enable: boolean
  /**
   * Name of the environment variable that holds the API key. Defaults to
   * `TYPESAFE_API_KEY`; set it when the key lives under another name.
   */
  env: string
  /**
   * Jev model to ask. Pinned to `jev-1.13.0` by default because the
   * thresholds in `src/typesafe.ts` were tested against it; an alias such as
   * `jev-latest` can move underneath them.
   */
  model: string
  /**
   * Milliseconds to wait for each attempt (one retry follows a timeout).
   * Every run waits for the check, so this bounds the delay a slow service
   * adds.
   */
  timeout: number
}

/** Fully-resolved configuration after merging defaults, file config and CLI flags. */
export interface Config {
  /** Format the subject line as a Conventional Commit (`type(scope): description`). */
  conventionalCommits: boolean
  /** Prefix the subject line with a gitmoji. */
  gitmoji: boolean
  /** Produce a multi-line commit (subject + body) instead of a single subject line. */
  multiline: boolean
  /**
   * Template for the first line. `{message}` is replaced with the generated
   * subject. Useful for ticket prefixes, e.g. `"[PROJ-123] {message}"`.
   */
  template: string | null
  /** Extra instructions appended to the standard prompt. */
  customPrompt: string | null
  /**
   * Default to interactive mode (the `-i` selection TUI) on every run, without
   * needing to pass `-i`. Override for a single run with `--no-interactive`.
   * When there is no interactive terminal (a pipe, CI, etc.) this is ignored and
   * cco falls back to the non-interactive flow rather than failing.
   */
  interactive: boolean
  /** How many candidate messages to generate in interactive mode. */
  interactiveCount: number
  /**
   * Name of the progress spinner animation: any spinner from the cli-spinners
   * set bundled with ora (e.g. `"dots"`, `"moon"`, `"material"`). Unknown
   * names are ignored and the default is used instead.
   */
  spinner: string
  /** Models for each pipeline stage. */
  models: ModelConfig
  /**
   * Skip diff summarisation and send only changed filenames to the final
   * model. Uses less time and tokens at the cost of less useful messages.
   * Defaults to false; ignore and lowPriorityPaths still apply.
   */
  filenamesOnly: boolean
  /**
   * Approximate maximum number of tokens of diff to send to the summary model
   * in a single request. Diffs larger than this are split across requests.
   */
  maxChunkTokens: number
  /** Approximate characters-per-token ratio used for chunk-size estimation. */
  charsPerToken: number
  /**
   * Replace runs of armored/encoded diff lines (age/gpg armor, base64 blobs,
   * git binary patch bodies) with a one-line `[... lines omitted]` marker
   * before summarizing. Ciphertext is unreadable to the model and tokenizes
   * at roughly one token per character, so skipping it makes commits in
   * encrypted-file repos (e.g. chezmoi with age) fast and cheap without
   * losing anything a summary could actually use.
   */
  skipArmored: boolean
  /**
   * Gitignore-style patterns for paths whose changes matter less than the
   * rest of the commit: generated docs, lockfiles, vendored snapshots, build
   * output. Diff sections under these paths are summarised separately and
   * briefly, and the final model is told to describe the other changes in
   * the subject line and to mention these only after them. When every
   * changed file matches, the changes are described normally - there is
   * nothing else for them to yield to. A pattern containing `/` matches a
   * path or any ancestor directory; a bare pattern matches any path segment
   * (see `src/paths.ts`).
   */
  lowPriorityPaths: string[]
  /**
   * Gitignore-style patterns - the same language as `lowPriorityPaths` - for
   * paths whose changes should not be read at all: vendored dependency
   * trees, generated clients, bulk data fixtures. Matching diff sections are
   * dropped before anything else looks at the diff, so they cost no tokens
   * and cannot influence the message.
   *
   * The files are still committed; this governs only what the model reads.
   * When every changed file matches, there is nothing left to describe and
   * the run stops with an error naming the directive - unlike
   * `lowPriorityPaths`, which promotes its partition in that case, because
   * "this matters less" can degrade gracefully and "do not look at this"
   * cannot.
   */
  ignore: string[]
  /** Settings for the TypeSafe candidate check. */
  typesafe: TypeSafeConfig
  /**
   * Allow API credentials from the environment (`ANTHROPIC_API_KEY` /
   * `ANTHROPIC_AUTH_TOKEN`) to be used, billing pay-as-you-go instead of the
   * Claude subscription. When false (the default) those variables are
   * stripped from the environment passed to the Claude Agent SDK subprocess,
   * so an exported key can never silently switch billing.
   */
  allowApiKey: boolean
}

/** Partial config as it may appear in a config file or be produced by flags. */
export type PartialConfig = {
  [K in keyof Config]?: K extends 'models'
    ? Partial<ModelConfig>
    : K extends 'typesafe'
      ? Partial<TypeSafeConfig>
      : Config[K]
}

/**
 * How much weight a slice of the diff carries in the commit message.
 * `primary` changes define the commit; `low` changes - those under the
 * configured `lowPriorityPaths` - are summarised briefly and mentioned only
 * after the primary ones.
 */
export type ChangePriority = 'primary' | 'low'

/** The summary of one diff chunk, tagged with the priority of the partition it came from. */
export interface DiffSummary {
  priority: ChangePriority
  text: string
}

/** Result of a single model invocation. */
export interface ModelResult {
  /** The text the model produced. */
  text: string
  /** Cost of the call in USD, if reported. */
  costUsd: number
  /** The model that actually served the request, if reported. */
  model?: string
  /** Parsed structured output, when a JSON-schema `outputFormat` was requested. */
  structured?: unknown
}

/** A staged change as seen by `git`. */
export interface FileChange {
  /** Status code from `git diff --name-status` (e.g. `A`, `M`, `D`, `R100`). */
  status: string
  /** Path of the file (the destination path for renames). */
  path: string
}

/** One prompt to one Claude model. */
export interface RunPromptOptions {
  /** Model string: an alias (`sonnet`) or a full id. */
  model: string
  /** Full custom system prompt. */
  system: string
  /** Receives assistant text as it streams in (enables partial messages). */
  onText?: (delta: string) => void
  /** Abort the in-flight request. */
  abortController?: AbortController
  /** Receives the underlying CLI's stderr (for `--verbose`). */
  onStderr?: (data: string) => void
  /**
   * Request a structured JSON response matching this schema. The parsed object
   * is returned on {@link ModelResult.structured}. Models that don't support
   * structured outputs will reject the request or return unparseable content,
   * so the caller should be prepared to retry without it.
   */
  outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> }
  /**
   * Allow API credentials from the environment to reach the Claude Agent SDK
   * subprocess. Defaults to false: `ANTHROPIC_API_KEY` /
   * `ANTHROPIC_AUTH_TOKEN` are stripped so the run is billed to the Claude
   * subscription.
   */
  allowApiKey?: boolean
}
