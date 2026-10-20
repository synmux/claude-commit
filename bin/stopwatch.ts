/**
 * Time how long a model takes to write commit messages for a small, a
 * medium and a large commit - to see whether an Ollama model is too big
 * for this machine, or how a Claude model compares.
 *
 *   node bin/stopwatch.ts ollama:gemma4:e4b-it-qat
 *   node bin/stopwatch.ts sonnet
 *
 * Each commit runs through the real pipeline (summary stage, then final
 * stage) with the given model in both stages. Every other setting - the
 * Ollama host, window and `ollama.maxChunkTokens`, `maxChunkTokens`,
 * `allowApiKey` - comes from your claude-commit config, so the timings
 * match what `cco` would do. A `package.stopwatch.json` at the repo root,
 * when present, is read in place of `package.json`, so its `claude-commit`
 * key can hold experimental settings without touching the real config.
 * The commits are synthetic - no real changeset is read - and start with a
 * random token on every run, so a server's prompt cache cannot make a
 * repeat run look faster. Git is used only to find your config file.
 *
 * Development only: excluded from the published package.
 */
import { randomBytes } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { runPrompt } from '../src/agent.ts'
import { loadFileConfig, resolveConfig } from '../src/config.ts'
import { ClaudeCommitError } from '../src/errors.ts'
import { generateCommit } from '../src/generate.ts'
import { getRepoRoot, isGitRepo } from '../src/git.ts'
import { isOllamaModel } from '../src/models.ts'
import { estimateDiffTokens } from '../src/tokens.ts'

/** How many files a synthetic commit touches, and how many changed lines each gets. */
export interface CommitSize {
  files: number
  linesPerFile: number
}

/** Small is one quick fix; large is about the size that first hit Ollama's 300 s limit (~40k tokens). */
export const COMMIT_SIZES = {
  small: { files: 1, linesPerFile: 24 },
  medium: { files: 6, linesPerFile: 100 },
  large: { files: 40, linesPerFile: 70 }
} as const satisfies Record<string, CommitSize>

const AREAS = ['config', 'generate', 'ollama', 'prompts', 'tokens', 'ui', 'diff', 'paths', 'agent', 'git']
const NOUNS = ['budget', 'chunk', 'window', 'summary', 'option', 'pattern', 'request', 'reply', 'limit', 'path']
const VERBS = ['resolve', 'measure', 'split', 'merge', 'check', 'format', 'parse', 'clamp', 'load', 'render']

/** A small seeded generator (mulberry32), so a seed always gives the same commit. */
function seededRandom(seed: string): () => number {
  let state = 0
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * A unified diff of plausible TypeScript edits. The seed sits in the first
 * file's path, so two seeds differ from the very first line.
 */
export function syntheticDiff(size: CommitSize, seed: string): string {
  const random = seededRandom(seed)
  const pick = (words: readonly string[]) => words[Math.floor(random() * words.length)] ?? 'value'
  const sections: string[] = []
  for (let file = 0; file < size.files; file++) {
    const path = `src/${pick(AREAS)}/${pick(NOUNS)}-${file === 0 ? seed : Math.floor(random() * 1e6)}.ts`
    const lines: string[] = []
    while (lines.length < size.linesPerFile) {
      const name = `${pick(VERBS)}${pick(NOUNS).replace(/^./, (letter) => letter.toUpperCase())}`
      const factor = Math.floor(random() * 997)
      const removed = random() < 0.4
      lines.push(
        ` export function ${name}(input: number, options: { ${pick(NOUNS)}: number }): number {`,
        `${removed ? '-' : '+'}  const ${pick(NOUNS)} = input * ${factor} + options.${pick(NOUNS)}`,
        `+  if (input > ${factor * 3}) throw new Error('${pick(NOUNS)} is over the ${pick(NOUNS)} limit')`,
        `${removed ? '-' : '+'}  return Math.max(0, ${pick(NOUNS)} - ${Math.floor(random() * 100)})`,
        ' }'
      )
    }
    const removedCount = lines.filter((line) => !line.startsWith('+')).length
    const addedCount = lines.filter((line) => !line.startsWith('-')).length
    sections.push(
      [
        `diff --git a/${path} b/${path}`,
        `index ${randomHex(random)}..${randomHex(random)} 100644`,
        `--- a/${path}`,
        `+++ b/${path}`,
        `@@ -1,${removedCount} +1,${addedCount} @@`,
        ...lines
      ].join('\n')
    )
  }
  return `${sections.join('\n')}\n`
}

function randomHex(random: () => number): string {
  return Math.floor(random() * 0xfffffff)
    .toString(16)
    .padStart(7, '0')
}

/** The repo-root file the stopwatch reads in place of `package.json`, when it exists. */
export const STOPWATCH_PACKAGE_FILE = 'package.stopwatch.json'

/** `package.stopwatch.json` if `root` has one, else `package.json`. */
export async function stopwatchPackageFile(root: string): Promise<string> {
  const found = await stat(join(root, STOPWATCH_PACKAGE_FILE)).then(
    (entry) => entry.isFile(),
    () => false
  )
  return found ? STOPWATCH_PACKAGE_FILE : 'package.json'
}

/** Milliseconds as `4.3 s`, or `-` when nothing ran. */
export function formatSeconds(milliseconds: number | undefined): string {
  return milliseconds === undefined ? '-' : `${(milliseconds / 1000).toFixed(1)} s`
}

/** One timed commit. */
interface Timing {
  size: string
  lines: number
  tokens: number
  chunks: number
  summaryMs: number
  finalMs: number | undefined
  totalMs: number
  costUsd: number
  outcome: string
}

async function main(argv: string[]): Promise<number> {
  const model = argv[0]
  if (!model || model.startsWith('-')) {
    process.stderr.write('Usage: node bin/stopwatch.ts <model>   e.g. ollama:gemma4:e4b-it-qat or sonnet\n')
    return 2
  }

  const cwd = process.cwd()
  const root = (await isGitRepo()) ? await getRepoRoot() : cwd
  const packageFile = await stopwatchPackageFile(root)
  process.stderr.write(`config: ${packageFile}\n`)
  const config = resolveConfig(await loadFileConfig(cwd, root, undefined, process.env, packageFile), {
    models: { summary: model, final: model },
    // Time the model, not cco's optional extras or path filters.
    typesafe: { enable: false },
    ignore: [],
    lowPriorityPaths: [],
    filenamesOnly: false
  })

  const abortController = new AbortController()
  process.once('SIGINT', () => abortController.abort())

  const timings: Timing[] = []
  let windowNote = ''
  for (const [size, shape] of Object.entries(COMMIT_SIZES)) {
    const diff = syntheticDiff(shape, randomBytes(6).toString('hex'))
    const tokens = estimateDiffTokens(diff, config.charsPerToken)
    process.stderr.write(`${size}: ${shape.files} file(s), ~${tokens} tokens ...\n`)
    let summaryMs = 0
    let finalMs: number | undefined
    const started = Date.now()
    try {
      const result = await generateCommit(diff, config, {
        abortController,
        runner: async (prompt, opts) => {
          const callStarted = Date.now()
          try {
            return await runPrompt(prompt, opts)
          } finally {
            const elapsed = Date.now() - callStarted
            // The final stage is the only one that asks for structured output or streams.
            if (opts.outputFormat || opts.onText) finalMs = (finalMs ?? 0) + elapsed
            else summaryMs += elapsed
          }
        }
      })
      const window = result.ollamaContexts[0]
      if (window)
        windowNote = `context window ${window.tokens} tokens (${window.source === 'auto' ? 'chosen by the server' : 'from config'})`
      timings.push({
        size,
        lines: diff.split('\n').length,
        tokens,
        chunks: result.chunkCount,
        summaryMs,
        finalMs,
        totalMs: Date.now() - started,
        costUsd: result.costUsd,
        outcome: `ok: ${result.messages[0]?.split('\n', 1)[0] ?? ''}`
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      timings.push({
        size,
        lines: diff.split('\n').length,
        tokens,
        chunks: 0,
        summaryMs,
        finalMs,
        totalMs: Date.now() - started,
        costUsd: 0,
        outcome: `FAILED: ${message}`
      })
      if (abortController.signal.aborted) break
      if (!(error instanceof ClaudeCommitError)) throw error
    }
  }

  const capNote =
    isOllamaModel(model) && config.ollama.maxChunkTokens !== undefined
      ? `, chunks capped at ${config.ollama.maxChunkTokens} tokens`
      : ''
  process.stdout.write(`\nmodel ${model}${windowNote ? `, ${windowNote}` : ''}${capNote}\n\n`)
  process.stdout.write('size     lines   ~tokens  chunks  summary   final     total     cost     result\n')
  for (const timing of timings) {
    process.stdout.write(
      [
        timing.size.padEnd(7),
        String(timing.lines).padStart(6),
        String(timing.tokens).padStart(9),
        String(timing.chunks).padStart(7),
        formatSeconds(timing.summaryMs).padStart(8),
        formatSeconds(timing.finalMs).padStart(8),
        formatSeconds(timing.totalMs).padStart(9),
        `$${timing.costUsd.toFixed(4)}`.padStart(8),
        `  ${timing.outcome}`
      ].join(' ') + '\n'
    )
  }
  return timings.some((timing) => timing.outcome.startsWith('FAILED')) ? 1 : 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
