/**
 * Configuration loading and merging.
 *
 * Precedence (low to high): built-in defaults < a global user config in
 * `$XDG_CONFIG_HOME/claude-commit` (default `~/.config/claude-commit`) <
 * `package.json` (`claude-commit` key at the repo root) < the nearest project
 * `.claude-commit.json` / `.claude-commitrc(.json)` file (searched cwd → repo
 * root) < CLI flags.
 */
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { ClaudeCommitError } from "./errors";
import { DEFAULT_SPINNER, isSpinnerName } from "./ui/spinner";
import { DEFAULT_OLLAMA_CONTEXT, DEFAULT_OLLAMA_HOST } from "./models";
import type { Config, ModelConfig, OllamaConfig, PartialConfig } from "./types";

export const DEFAULT_CONFIG: Config = {
  conventionalCommits: false,
  gitmoji: false,
  multiline: false,
  template: null,
  customPrompt: null,
  interactive: false,
  interactiveCount: 3,
  interactiveTemperature: 1,
  spinner: DEFAULT_SPINNER,
  models: {
    summary: "sonnet",
    final: "sonnet",
  },
  maxChunkTokens: 600_000,
  charsPerToken: 3.5,
  skipArmored: false,
  lowPriorityPaths: [],
  ignore: [],
  ollama: {
    host: DEFAULT_OLLAMA_HOST,
    context: DEFAULT_OLLAMA_CONTEXT,
    keepAlive: null,
  },
  allowApiKey: false,
};

const CONFIG_FILENAMES = [
  ".claude-commit.json",
  ".claude-commitrc.json",
  ".claude-commitrc",
];

/**
 * Filenames accepted inside the global config directory, most-preferred first.
 * `config.json` is the canonical name (the directory already says which tool it
 * is for); the project-style names are also honoured so a config can be copied
 * or symlinked there.
 */
const GLOBAL_CONFIG_FILENAMES = ["config.json", ...CONFIG_FILENAMES];

/**
 * The user-level config directory, `$XDG_CONFIG_HOME/claude-commit` (falling back
 * to `~/.config/claude-commit`). Per the XDG Base Directory spec, `XDG_CONFIG_HOME`
 * is honoured only when it is set to an absolute path.
 */
export function globalConfigDir(
  env: Record<string, string | undefined> = process.env,
): string {
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".config");
  return join(base, "claude-commit");
}

/** The first existing global config file in {@link globalConfigDir}, if any. */
async function findGlobalConfigFile(
  env: Record<string, string | undefined> = process.env,
): Promise<string | undefined> {
  const dir = globalConfigDir(env);
  for (const name of GLOBAL_CONFIG_FILENAMES) {
    const candidate = join(dir, name);
    if (await Bun.file(candidate).exists()) return candidate;
  }
  return undefined;
}

/**
 * Deep-ish merge of a partial config over a base config: `models` and
 * `ollama` are merged key by key; the path lists (`lowPriorityPaths`,
 * `ignore`) are replaced whole - a higher layer's list wins outright, so a
 * project can drop a global pattern - and copied so the result never
 * aliases the base's array.
 */
export function mergeConfig(base: Config, override: PartialConfig): Config {
  const models: ModelConfig = { ...base.models, ...(override.models ?? {}) };
  const ollama: OllamaConfig = { ...base.ollama, ...(override.ollama ?? {}) };
  const lowPriorityPaths = [
    ...(override.lowPriorityPaths ?? base.lowPriorityPaths),
  ];
  const ignore = [...(override.ignore ?? base.ignore)];
  const merged: Config = {
    ...base,
    ...override,
    models,
    ollama,
    lowPriorityPaths,
    ignore,
  };
  return merged;
}

/** Validate and normalize a parsed partial config, ignoring unknown keys. */
export function sanitizePartial(raw: unknown): PartialConfig {
  if (raw === null || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: PartialConfig = {};

  const bool = (k: keyof Config) => {
    if (typeof obj[k] === "boolean")
      (out as Record<string, unknown>)[k] = obj[k];
  };
  bool("conventionalCommits");
  bool("gitmoji");
  bool("multiline");
  bool("interactive");
  bool("skipArmored");
  bool("allowApiKey");

  if (typeof obj.template === "string") out.template = obj.template;
  else if (obj.template === null) out.template = null;
  if (typeof obj.customPrompt === "string") out.customPrompt = obj.customPrompt;
  else if (obj.customPrompt === null) out.customPrompt = null;

  if (
    typeof obj.interactiveCount === "number" &&
    Number.isFinite(obj.interactiveCount)
  ) {
    out.interactiveCount = Math.max(1, Math.floor(obj.interactiveCount));
  }
  if (obj.interactiveTemperature === null) {
    out.interactiveTemperature = null;
  } else if (
    typeof obj.interactiveTemperature === "number" &&
    Number.isFinite(obj.interactiveTemperature)
  ) {
    out.interactiveTemperature = Math.min(
      2,
      Math.max(0, obj.interactiveTemperature),
    );
  }
  if (typeof obj.spinner === "string" && isSpinnerName(obj.spinner)) {
    out.spinner = obj.spinner;
  }
  if (typeof obj.maxChunkTokens === "number" && obj.maxChunkTokens > 0) {
    out.maxChunkTokens = Math.floor(obj.maxChunkTokens);
  }
  if (typeof obj.charsPerToken === "number" && obj.charsPerToken > 0) {
    out.charsPerToken = obj.charsPerToken;
  }
  // An explicit empty list is meaningful for either path option: it clears
  // patterns inherited from a lower layer, so it is kept rather than
  // treated as "unset".
  if (Array.isArray(obj.lowPriorityPaths)) {
    out.lowPriorityPaths = cleanPatternList(obj.lowPriorityPaths);
  }
  if (Array.isArray(obj.ignore)) {
    out.ignore = cleanPatternList(obj.ignore);
  }

  if (obj.models && typeof obj.models === "object") {
    const m = obj.models as Record<string, unknown>;
    const models: Partial<ModelConfig> = {};
    // A blank model name is not an override, it is a mistake: leaving the
    // key unset keeps the layer below, which is a working model.
    if (typeof m.summary === "string" && m.summary.trim() !== "") {
      models.summary = m.summary.trim();
    }
    if (typeof m.final === "string" && m.final.trim() !== "") {
      models.final = m.final.trim();
    }
    if (Object.keys(models).length) out.models = models;
  }

  if (obj.ollama && typeof obj.ollama === "object") {
    const o = obj.ollama as Record<string, unknown>;
    const ollama: Partial<OllamaConfig> = {};
    if (typeof o.host === "string" && o.host.trim() !== "") {
      ollama.host = o.host.trim();
    }
    if (typeof o.context === "number" && o.context > 0) {
      ollama.context = Math.floor(o.context);
    } else if (o.context === "auto") {
      ollama.context = "auto";
    }
    if (typeof o.keepAlive === "string" || typeof o.keepAlive === "number") {
      ollama.keepAlive = o.keepAlive;
    } else if (o.keepAlive === null) {
      ollama.keepAlive = null;
    }
    if (Object.keys(ollama).length) out.ollama = ollama;
  }

  return out;
}

/**
 * Clean one raw path-pattern list: drop non-strings and blanks, trim the
 * rest. Shared by `lowPriorityPaths` and `ignore`, which take the same
 * pattern language (see `src/paths.ts`).
 */
function cleanPatternList(raw: unknown[]): string[] {
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

async function readJsonIfExists(path: string): Promise<unknown | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  try {
    return await file.json();
  } catch (err) {
    throw new ClaudeCommitError(
      `Failed to parse config file ${path}: ${(err as Error).message}`,
    );
  }
}

/** Walk from `startDir` up to and including `rootDir`, returning the first config file found. */
async function findConfigFile(
  startDir: string,
  rootDir: string,
): Promise<string | undefined> {
  let dir = resolve(startDir);
  const stop = resolve(rootDir);
  // Always terminates: we stop at `rootDir`, and `dirname` of the filesystem
  // root returns itself (`parent === dir`), so even when `startDir` is not under
  // `rootDir` the walk halts at the root regardless of directory depth.
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (await Bun.file(candidate).exists()) return candidate;
    }
    if (dir === stop) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Load and merge the file-based configuration layers that sit below CLI flags,
 * lowest first: the global user config, then `package.json`'s `claude-commit` key
 * at the repo root, then the nearest project config file (searched from `cwd` up
 * to `repoRoot`). An explicit `configPath` short-circuits the project-file
 * discovery; the global and `package.json` layers still apply beneath it. `env`
 * supplies `XDG_CONFIG_HOME` for locating the global config (defaults to
 * `process.env`).
 */
export async function loadFileConfig(
  cwd: string,
  repoRoot: string,
  configPath?: string,
  env: Record<string, string | undefined> = process.env,
): Promise<PartialConfig> {
  let result: PartialConfig = {};

  // Global user config (lowest precedence): $XDG_CONFIG_HOME/claude-commit. Like
  // a project config file, a malformed one throws (it is a file the user wrote
  // deliberately), which readJsonIfExists handles.
  const globalPath = await findGlobalConfigFile(env);
  if (globalPath) {
    result = mergePartial(
      result,
      sanitizePartial(await readJsonIfExists(globalPath)),
    );
  }

  // package.json#claude-commit at the repo root (above the global config, below
  // project config files). A malformed package.json is not cco's concern to
  // enforce - skip it rather than blocking the commit (the user may even be
  // committing its fix).
  let pkg: unknown;
  try {
    pkg = await readJsonIfExists(join(repoRoot, "package.json"));
  } catch {
    pkg = undefined;
  }
  if (pkg && typeof pkg === "object" && "claude-commit" in (pkg as object)) {
    result = mergePartial(
      result,
      sanitizePartial((pkg as Record<string, unknown>)["claude-commit"]),
    );
  }

  const filePath = configPath
    ? resolve(cwd, configPath)
    : await findConfigFile(cwd, repoRoot);
  if (filePath) {
    const raw = await readJsonIfExists(filePath);
    if (raw === undefined && configPath) {
      throw new ClaudeCommitError(`Config file not found: ${filePath}`);
    }
    result = mergePartial(result, sanitizePartial(raw));
  }

  return result;
}

/**
 * Merge two partial configs: `models` and `ollama` are merged key by key;
 * every other key, including both path lists, is taken whole from the
 * override when present.
 */
export function mergePartial(
  base: PartialConfig,
  override: PartialConfig,
): PartialConfig {
  const out: PartialConfig = { ...base, ...override };
  if (base.models || override.models) {
    out.models = { ...base.models, ...override.models };
  }
  if (base.ollama || override.ollama) {
    out.ollama = { ...base.ollama, ...override.ollama };
  }
  const lowPriorityPaths = override.lowPriorityPaths ?? base.lowPriorityPaths;
  if (lowPriorityPaths) out.lowPriorityPaths = [...lowPriorityPaths];
  const ignore = override.ignore ?? base.ignore;
  if (ignore) out.ignore = [...ignore];
  return out;
}

/** Produce a fully-resolved config from file config and CLI-flag overrides. */
export function resolveConfig(
  fileConfig: PartialConfig,
  flagConfig: PartialConfig,
): Config {
  return mergeConfig(DEFAULT_CONFIG, mergePartial(fileConfig, flagConfig));
}
