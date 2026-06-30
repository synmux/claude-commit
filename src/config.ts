/**
 * Configuration loading and merging.
 *
 * Precedence (low to high): built-in defaults < `package.json` (`claudecommit`
 * key) < a `.claudecommit.json` / `.claudecommitrc(.json)` file < CLI flags.
 */
import { dirname, join, resolve } from "node:path";
import type { Config, ModelConfig, PartialConfig } from "./types";

export const DEFAULT_CONFIG: Config = {
  conventionalCommits: false,
  gitmoji: false,
  multiline: false,
  template: null,
  customPrompt: null,
  interactiveCount: 3,
  models: {
    summary: "sonnet[1m]",
    final: "haiku",
  },
  maxChunkTokens: 600_000,
  charsPerToken: 3.5,
};

const CONFIG_FILENAMES = [
  ".claudecommit.json",
  ".claudecommitrc.json",
  ".claudecommitrc",
];

/** Deep-ish merge of a partial config over a base config (only `models` is nested). */
export function mergeConfig(base: Config, override: PartialConfig): Config {
  const models: ModelConfig = { ...base.models, ...(override.models ?? {}) };
  const merged: Config = { ...base, ...override, models };
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
  if (typeof obj.maxChunkTokens === "number" && obj.maxChunkTokens > 0) {
    out.maxChunkTokens = Math.floor(obj.maxChunkTokens);
  }
  if (typeof obj.charsPerToken === "number" && obj.charsPerToken > 0) {
    out.charsPerToken = obj.charsPerToken;
  }

  if (obj.models && typeof obj.models === "object") {
    const m = obj.models as Record<string, unknown>;
    const models: Partial<ModelConfig> = {};
    if (typeof m.summary === "string") models.summary = m.summary;
    if (typeof m.final === "string") models.final = m.final;
    if (Object.keys(models).length) out.models = models;
  }

  return out;
}

async function readJsonIfExists(path: string): Promise<unknown | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  try {
    return await file.json();
  } catch (err) {
    throw new Error(
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
  // Guard against an infinite loop if startDir is not under rootDir.
  for (let i = 0; i < 64; i++) {
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
 * Load file-based configuration: the nearest config file (searched from `cwd`
 * up to `repoRoot`) merged over `package.json`'s `claudecommit` key at the repo
 * root. An explicit `configPath` short-circuits discovery.
 */
export async function loadFileConfig(
  cwd: string,
  repoRoot: string,
  configPath?: string,
): Promise<PartialConfig> {
  let result: PartialConfig = {};

  // package.json#claudecommit at the repo root (lowest precedence of the files).
  const pkg = await readJsonIfExists(join(repoRoot, "package.json"));
  if (pkg && typeof pkg === "object" && "claudecommit" in (pkg as object)) {
    result = mergePartial(
      result,
      sanitizePartial((pkg as Record<string, unknown>).claudecommit),
    );
  }

  const filePath = configPath
    ? resolve(cwd, configPath)
    : await findConfigFile(cwd, repoRoot);
  if (filePath) {
    const raw = await readJsonIfExists(filePath);
    if (raw === undefined && configPath) {
      throw new Error(`Config file not found: ${filePath}`);
    }
    result = mergePartial(result, sanitizePartial(raw));
  }

  return result;
}

/** Merge two partial configs (only `models` is nested). */
export function mergePartial(
  base: PartialConfig,
  override: PartialConfig,
): PartialConfig {
  const out: PartialConfig = { ...base, ...override };
  if (base.models || override.models) {
    out.models = { ...base.models, ...override.models };
  }
  return out;
}

/** Produce a fully-resolved config from file config and CLI-flag overrides. */
export function resolveConfig(
  fileConfig: PartialConfig,
  flagConfig: PartialConfig,
): Config {
  return mergeConfig(DEFAULT_CONFIG, mergePartial(fileConfig, flagConfig));
}
