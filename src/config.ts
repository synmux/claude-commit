/**
 * Configuration loading and merging.
 *
 * Precedence (low to high): built-in defaults < a global user config in
 * `$XDG_CONFIG_HOME/claude-commit` (default `~/.config/claude-commit`) <
 * `package.json` (`claude-commit` key at the repo root) < the nearest project
 * `.claude-commit.json` / `.claude-commitrc(.json)` file (searched cwd → repo
 * root) < CLI flags.
 */
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { DEFAULT_ARMOR_ALPHABETS, isArmorAlphabet } from './diff.ts'
import { ClaudeCommitError } from './errors.ts'
import type { Config, ModelConfig, PartialConfig, TypeSafeConfig } from './types.ts'
import { DEFAULT_SPINNER, isSpinnerName } from './ui/spinner.ts'

export const DEFAULT_CONFIG: Config = {
  conventionalCommits: null,
  gitmoji: null,
  multiline: null,
  template: null,
  customPrompt: null,
  interactive: false,
  interactiveCount: 3,
  spinner: DEFAULT_SPINNER,
  models: {
    commits: null,
    summary: 'sonnet',
    final: 'sonnet'
  },
  maxChunkTokens: 600_000,
  charsPerToken: 3.5,
  filenamesOnly: false,
  skipArmored: false,
  armorAlphabets: [...DEFAULT_ARMOR_ALPHABETS],
  textconv: false,
  lowPriorityPaths: [],
  ignore: [],
  typesafe: {
    enable: false,
    env: 'TYPESAFE_API_KEY',
    model: 'jev-1.13.0',
    timeout: 5_000
  },
  allowApiKey: false
}

const CONFIG_FILENAMES = ['.claude-commit.json', '.claude-commitrc.json', '.claude-commitrc']

/**
 * Filenames accepted inside the global config directory, most-preferred first.
 * `config.json` is the canonical name (the directory already says which tool it
 * is for); the project-style names are also honoured so a config can be copied
 * or symlinked there.
 */
const GLOBAL_CONFIG_FILENAMES = ['config.json', ...CONFIG_FILENAMES]

/** Whether `path` names an existing regular file (a directory does not count). */
async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * The user-level config directory, `$XDG_CONFIG_HOME/claude-commit` (falling back
 * to `~/.config/claude-commit`). Per the XDG Base Directory spec, `XDG_CONFIG_HOME`
 * is honoured only when it is set to an absolute path.
 */
export function globalConfigDir(env: Record<string, string | undefined> = process.env): string {
  const xdg = env.XDG_CONFIG_HOME
  const base = xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.config')
  return join(base, 'claude-commit')
}

/** The first existing global config file in {@link globalConfigDir}, if any. */
async function findGlobalConfigFile(
  env: Record<string, string | undefined> = process.env
): Promise<string | undefined> {
  const dir = globalConfigDir(env)
  for (const name of GLOBAL_CONFIG_FILENAMES) {
    const candidate = join(dir, name)
    if (await fileExists(candidate)) return candidate
  }
  return undefined
}

/**
 * Deep-ish merge of a partial config over a base config: `models` and
 * `typesafe` are merged key by key; the path lists (`lowPriorityPaths`,
 * `ignore`) are replaced whole - a higher layer's list wins outright, so a
 * project can drop a global pattern - and copied so the result never
 * aliases the base's array.
 */
export function mergeConfig(base: Config, override: PartialConfig): Config {
  const models: ModelConfig = { ...base.models, ...override.models }
  const typesafe: TypeSafeConfig = { ...base.typesafe, ...override.typesafe }
  const lowPriorityPaths = [...(override.lowPriorityPaths ?? base.lowPriorityPaths)]
  const ignore = [...(override.ignore ?? base.ignore)]
  const armorAlphabets = [...(override.armorAlphabets ?? base.armorAlphabets)]
  const merged: Config = {
    ...base,
    ...override,
    models,
    typesafe,
    lowPriorityPaths,
    ignore,
    armorAlphabets
  }
  return merged
}

/**
 * A `template` or `customPrompt` value: blank means none. The prompt builder
 * already skips a blank one, so `null` makes every other reader - the
 * TypeSafe check above all - agree that nothing was asked.
 */
export function textOption(value: string): string | null {
  return value.trim() === '' ? null : value
}

/** Validate and normalize a parsed partial config, ignoring unknown keys. */
export function sanitizePartial(raw: unknown): PartialConfig {
  if (raw === null || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const out: PartialConfig = {}

  const bool = (k: keyof Config) => {
    if (typeof obj[k] === 'boolean') (out as Record<string, unknown>)[k] = obj[k]
  }
  bool('conventionalCommits')
  bool('gitmoji')
  bool('multiline')
  for (const key of ['conventionalCommits', 'gitmoji', 'multiline'] as const) {
    if (obj[key] === null) out[key] = null
  }
  bool('interactive')
  bool('skipArmored')
  bool('textconv')
  bool('filenamesOnly')
  bool('allowApiKey')

  for (const key of ['template', 'customPrompt'] as const) {
    const value = obj[key]
    if (typeof value === 'string') out[key] = textOption(value)
    else if (value === null) out[key] = null
  }

  if (typeof obj.interactiveCount === 'number' && Number.isFinite(obj.interactiveCount)) {
    out.interactiveCount = Math.max(1, Math.floor(obj.interactiveCount))
  }
  if (typeof obj.spinner === 'string' && isSpinnerName(obj.spinner)) {
    out.spinner = obj.spinner
  }
  if (typeof obj.maxChunkTokens === 'number' && obj.maxChunkTokens >= 1) {
    out.maxChunkTokens = Math.floor(obj.maxChunkTokens)
  }
  if (typeof obj.charsPerToken === 'number' && obj.charsPerToken > 0) {
    out.charsPerToken = obj.charsPerToken
  }
  // An explicit empty list is meaningful for either path option: it clears
  // patterns inherited from a lower layer, so it is kept rather than
  // treated as "unset".
  if (Array.isArray(obj.lowPriorityPaths)) {
    out.lowPriorityPaths = cleanPatternList(obj.lowPriorityPaths)
  }
  if (Array.isArray(obj.ignore)) {
    out.ignore = cleanPatternList(obj.ignore)
  }
  if (Array.isArray(obj.armorAlphabets)) {
    const known = obj.armorAlphabets
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase())
      .filter(isArmorAlphabet)
    // `[]` deliberately redacts nothing, but a list of only typos is a
    // mistake, not that choice: keep the layer below, as for other values.
    if (known.length > 0 || obj.armorAlphabets.length === 0) {
      out.armorAlphabets = [...new Set(known)]
    }
  }

  if (obj.models && typeof obj.models === 'object') {
    const m = obj.models as Record<string, unknown>
    const models: Partial<ModelConfig> = {}
    if (m.commits === null) models.commits = null
    else if (typeof m.commits === 'string' && m.commits.trim() !== '') models.commits = m.commits.trim()
    // A blank model name is not an override, it is a mistake: leaving the
    // key unset keeps the layer below, which is a working model.
    if (typeof m.summary === 'string' && m.summary.trim() !== '') {
      models.summary = m.summary.trim()
    }
    if (typeof m.final === 'string' && m.final.trim() !== '') {
      models.final = m.final.trim()
    }
    if (Object.keys(models).length) out.models = models
  }

  if (obj.typesafe && typeof obj.typesafe === 'object') {
    const t = obj.typesafe as Record<string, unknown>
    const typesafe: Partial<TypeSafeConfig> = {}
    if (typeof t.enable === 'boolean') typesafe.enable = t.enable
    // A blank variable or model name is a mistake, not an override: the
    // layer below still names a working one.
    if (typeof t.env === 'string' && t.env.trim() !== '') typesafe.env = t.env.trim()
    if (typeof t.model === 'string' && t.model.trim() !== '') typesafe.model = t.model.trim()
    if (typeof t.timeout === 'number' && Number.isFinite(t.timeout) && t.timeout > 0) {
      typesafe.timeout = Math.floor(t.timeout)
    }
    if (Object.keys(typesafe).length) out.typesafe = typesafe
  }

  return out
}

/**
 * Clean one raw path-pattern list: drop non-strings and blanks, trim the
 * rest. Shared by `lowPriorityPaths` and `ignore`, which take the same
 * pattern language (see `src/paths.ts`).
 */
function cleanPatternList(raw: unknown[]): string[] {
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

async function readJsonIfExists(path: string): Promise<unknown | undefined> {
  if (!(await fileExists(path))) return undefined
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (err) {
    throw new ClaudeCommitError(`Failed to parse config file ${path}: ${(err as Error).message}`)
  }
}

/** Walk from `startDir` up to and including `rootDir`, returning the first config file found. */
async function findConfigFile(startDir: string, rootDir: string): Promise<string | undefined> {
  let dir = resolve(startDir)
  const stop = resolve(rootDir)
  // Always terminates: we stop at `rootDir`, and `dirname` of the filesystem
  // root returns itself (`parent === dir`), so even when `startDir` is not under
  // `rootDir` the walk halts at the root regardless of directory depth.
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name)
      if (await fileExists(candidate)) return candidate
    }
    if (dir === stop) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * Load and merge the file-based configuration layers that sit below CLI flags,
 * lowest first: the global user config, then `package.json`'s `claude-commit` key
 * at the repo root, then the nearest project config file (searched from `cwd` up
 * to `repoRoot`). An explicit `configPath` short-circuits the project-file
 * discovery; the global and `package.json` layers still apply beneath it. `env`
 * supplies `XDG_CONFIG_HOME` for locating the global config (defaults to
 * `process.env`).
 *
 * `package.json` and a discovered project file belong to the repository, so
 * they cannot turn on `textconv` or `allowApiKey` (see
 * {@link USER_ONLY_SETTINGS}); `onNote` hears about each value ignored.
 */
export async function loadFileConfig(
  cwd: string,
  repoRoot: string,
  configPath?: string,
  env: Record<string, string | undefined> = process.env,
  onNote?: (message: string) => void
): Promise<PartialConfig> {
  let result: PartialConfig = {}

  // Global user config (lowest precedence): $XDG_CONFIG_HOME/claude-commit. Like
  // a project config file, a malformed one throws (it is a file the user wrote
  // deliberately), which readJsonIfExists handles.
  const globalPath = await findGlobalConfigFile(env)
  if (globalPath) {
    result = mergePartial(result, sanitizePartial(await readJsonIfExists(globalPath)))
  }

  // package.json#claude-commit at the repo root (above the global config, below
  // project config files). A malformed package.json is not cco's concern to
  // enforce - skip it rather than blocking the commit (the user may even be
  // committing its fix).
  const packagePath = join(repoRoot, 'package.json')
  let pkg: unknown
  try {
    pkg = await readJsonIfExists(packagePath)
  } catch {
    pkg = undefined
  }
  if (pkg && typeof pkg === 'object' && 'claude-commit' in (pkg as object)) {
    const layer = sanitizePartial((pkg as Record<string, unknown>)['claude-commit'])
    result = mergePartial(result, restrictRepositoryLayer(layer, packagePath, onNote))
  }

  const filePath = configPath ? resolve(cwd, configPath) : await findConfigFile(cwd, repoRoot)
  if (filePath) {
    const raw = await readJsonIfExists(filePath)
    if (raw === undefined && configPath) {
      throw new ClaudeCommitError(`Config file not found: ${filePath}`)
    }
    // A file the user named with --config is theirs; a discovered one is the repository's.
    const layer = sanitizePartial(raw)
    result = mergePartial(result, configPath ? layer : restrictRepositoryLayer(layer, filePath, onNote))
  }

  return result
}

/**
 * Settings a repository's own config may turn off but never on, each with
 * what can turn it on instead. Turning one on sends something the user did
 * not agree to send: `textconv` feeds the output of the user's diff drivers,
 * decrypting ones included, to the model, and `allowApiKey` moves billing
 * from the subscription to API credits.
 */
const USER_ONLY_SETTINGS = {
  textconv: 'the global config, --config or --textconv',
  allowApiKey: 'the global config or --config'
} as const

/** A repository config layer without the user-only settings it tried to turn on. */
function restrictRepositoryLayer(
  layer: PartialConfig,
  source: string,
  onNote?: (message: string) => void
): PartialConfig {
  const restricted = { ...layer }
  for (const [key, enablers] of Object.entries(USER_ONLY_SETTINGS) as Array<
    [keyof typeof USER_ONLY_SETTINGS, string]
  >) {
    if (restricted[key] === true) {
      delete restricted[key]
      onNote?.(`Ignoring "${key}": true from ${source}: only ${enablers} can turn it on.`)
    }
  }
  return restricted
}

/**
 * Merge two partial configs: `models` and `typesafe` are merged key by
 * key; every other key, including both path lists, is taken whole
 * from the override when present.
 */
export function mergePartial(base: PartialConfig, override: PartialConfig): PartialConfig {
  const out: PartialConfig = { ...base, ...override }
  if (base.models || override.models) {
    out.models = { ...base.models, ...override.models }
  }
  if (base.typesafe || override.typesafe) {
    out.typesafe = { ...base.typesafe, ...override.typesafe }
  }
  const lowPriorityPaths = override.lowPriorityPaths ?? base.lowPriorityPaths
  if (lowPriorityPaths) out.lowPriorityPaths = [...lowPriorityPaths]
  const ignore = override.ignore ?? base.ignore
  if (ignore) out.ignore = [...ignore]
  const armorAlphabets = override.armorAlphabets ?? base.armorAlphabets
  if (armorAlphabets) out.armorAlphabets = [...armorAlphabets]
  return out
}

/** Produce a fully-resolved config from file config and CLI-flag overrides. */
export function resolveConfig(fileConfig: PartialConfig, flagConfig: PartialConfig): Config {
  return mergeConfig(DEFAULT_CONFIG, mergePartial(fileConfig, flagConfig))
}
