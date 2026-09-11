/**
 * Shared types for claude-commit.
 */

/**
 * Which models to use for each stage of the pipeline.
 *
 * A bare name (`sonnet`, `haiku`, a full `claude-*` id) runs through the
 * Claude Agent SDK. An `ollama:`-prefixed name runs against a local or
 * self-hosted Ollama server instead, with everything after the prefix taken
 * as the Ollama model name verbatim - tag included, so
 * `ollama:ornith-1.5:35b` means the model `ornith-1.5:35b`. The two stages
 * are resolved independently, so mixing providers is normal.
 */
export interface ModelConfig {
  /** Model used to read diffs and write summaries. Defaults to `sonnet`. */
  summary: string;
  /** Model used to turn summaries into the final commit message. Defaults to `sonnet`. */
  final: string;
}

/** Settings for the Ollama backend, used only by `ollama:`-prefixed models. */
export interface OllamaConfig {
  /**
   * Base URL of the Ollama server. Defaults to `$OLLAMA_HOST`, falling back
   * to `http://localhost:11434`. A bare `host:port` (Ollama's own
   * convention for that variable) is given an `http://` scheme.
   */
  host: string;
  /**
   * Context window requested for every Ollama call (`options.num_ctx`) and
   * used to size diff chunks: a token count, or `"auto"` (the default) to
   * take the window Ollama itself chooses for the model on this machine.
   *
   * The window is always sent explicitly, never left to the server: a
   * prompt over it is truncated *silently* - HTTP 200, oldest content
   * dropped, no flag on the response - and a summary written from half a
   * diff is worse than an error, so cco pins the number it sized its chunks
   * against and cross-checks the response's token counts.
   *
   * `"auto"` asks Ollama rather than guessing: the model is preloaded with
   * no `num_ctx`, which makes the server pick from its VRAM tiers (4k / 32k
   * / 256k, capped at the model's trained maximum), and the choice is read
   * back from `/api/ps`. That is the largest window the server believes
   * this machine can run, resolved once per model per run. A number pins
   * the window instead - lower it when memory is tight (memory scales with
   * it, multiplied by `OLLAMA_NUM_PARALLEL`), or raise it past the tier if
   * you know better than the server does.
   */
  context: number | "auto";
  /**
   * How long the server keeps the model loaded after a request: a duration
   * string (`"10m"`), seconds as a number, `0` to unload immediately, or a
   * negative value to pin it. `null` leaves the server's own default (which
   * is itself 5 minutes unless `OLLAMA_KEEP_ALIVE` says otherwise).
   */
  keepAlive: string | number | null;
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
  /**
   * Default to interactive mode (the `-i` selection TUI) on every run, without
   * needing to pass `-i`. Override for a single run with `--no-interactive`.
   * When there is no interactive terminal (a pipe, CI, etc.) this is ignored and
   * cco falls back to the non-interactive flow rather than failing.
   */
  interactive: boolean;
  /** How many candidate messages to generate in interactive mode. */
  interactiveCount: number;
  /**
   * Sampling temperature for the final model when generating interactive
   * options, to encourage variety between candidates. `null` leaves the model
   * at its default. Only applied in interactive mode.
   */
  interactiveTemperature: number | null;
  /**
   * Name of the progress spinner animation: any spinner from the cli-spinners
   * set bundled with ora (e.g. `"dots"`, `"moon"`, `"material"`). Unknown
   * names are ignored and the default is used instead.
   */
  spinner: string;
  /** Models for each pipeline stage. */
  models: ModelConfig;
  /**
   * Skip diff summarisation and send only changed filenames to the final
   * model. Uses less time and tokens at the cost of less useful messages.
   * Defaults to false; ignore and lowPriorityPaths still apply.
   */
  filenamesOnly: boolean;
  /**
   * Approximate maximum number of tokens of diff to send to the summary model
   * in a single request. Diffs larger than this are split across requests.
   */
  maxChunkTokens: number;
  /** Approximate characters-per-token ratio used for chunk-size estimation. */
  charsPerToken: number;
  /**
   * Replace runs of armored/encoded diff lines (age/gpg armor, base64 blobs,
   * git binary patch bodies) with a one-line `[... lines omitted]` marker
   * before summarizing. Ciphertext is unreadable to the model and tokenizes
   * at roughly one token per character, so skipping it makes commits in
   * encrypted-file repos (e.g. chezmoi with age) fast and cheap without
   * losing anything a summary could actually use.
   */
  skipArmored: boolean;
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
  lowPriorityPaths: string[];
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
  ignore: string[];
  /** Settings for the Ollama backend (`ollama:`-prefixed models). */
  ollama: OllamaConfig;
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
  [K in keyof Config]?: K extends "models"
    ? Partial<ModelConfig>
    : K extends "ollama"
      ? Partial<OllamaConfig>
      : Config[K];
};

/**
 * How much weight a slice of the diff carries in the commit message.
 * `primary` changes define the commit; `low` changes - those under the
 * configured `lowPriorityPaths` - are summarised briefly and mentioned only
 * after the primary ones.
 */
export type ChangePriority = "primary" | "low";

/** The summary of one diff chunk, tagged with the priority of the partition it came from. */
export interface DiffSummary {
  priority: ChangePriority;
  text: string;
}

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

/**
 * One prompt to one model, whichever provider serves it.
 *
 * `model` carries the provider: bare names go to Claude, `ollama:`-prefixed
 * ones to Ollama (see {@link ModelConfig}). Some options only apply to one
 * provider - `allowApiKey` gates Claude credentials, `ollama` supplies the
 * host and context window - and each is simply ignored by the other.
 */
export interface RunPromptOptions {
  /** Model string: an alias (`sonnet`), a full id, or `ollama:<name>[:<tag>]`. */
  model: string;
  /** Full custom system prompt. */
  system: string;
  /** Receives assistant text as it streams in (enables partial messages). */
  onText?: (delta: string) => void;
  /** Abort the in-flight request. */
  abortController?: AbortController;
  /** Receives the underlying CLI's stderr (for `--verbose`). Claude only. */
  onStderr?: (data: string) => void;
  /**
   * Sampling temperature. Used to add variety when generating several
   * interactive options. Models that don't accept a temperature override
   * will reject the request, so the caller should be prepared to retry
   * without it.
   */
  temperature?: number;
  /**
   * Request a structured JSON response matching this schema. The parsed object
   * is returned on {@link ModelResult.structured}. Models that don't support
   * structured outputs will reject the request or return unparseable content,
   * so the caller should be prepared to retry without it.
   */
  outputFormat?: { type: "json_schema"; schema: Record<string, unknown> };
  /**
   * Allow API credentials from the environment to reach the Claude Agent SDK
   * subprocess. Defaults to false: `ANTHROPIC_API_KEY` /
   * `ANTHROPIC_AUTH_TOKEN` are stripped so the run is billed to the Claude
   * subscription. Has no meaning for Ollama, which takes no credential.
   */
  allowApiKey?: boolean;
  /** Ollama host and context settings; required for an `ollama:` model. */
  ollama?: OllamaConfig;
}
