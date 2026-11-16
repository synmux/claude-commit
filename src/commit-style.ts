import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { runPrompt, validateCommitStyleModel } from './agent.ts'
import { ClaudeCommitError } from './errors.ts'
import { getRecentCommitMessages } from './git.ts'
import { buildCommitStyleSystem, buildCommitStyleUser } from './prompts.ts'
import { askLine } from './ui/editor.ts'

interface CommitStyleOptions {
  repoRoot: string
  model: string | null
  allowApiKey: boolean
  yes: boolean
  hasTty: boolean
  abortController?: AbortController
  onPhase?: (label: string) => void
  onNote?: (message: string) => void
  validateModel?: typeof validateCommitStyleModel
  readHistory?: typeof getRecentCommitMessages
  runner?: typeof runPrompt
  ask?: () => Promise<boolean>
}

export async function setupCommitStyle(options: CommitStyleOptions): Promise<string | null> {
  const {
    model,
    validateModel = validateCommitStyleModel,
    runner = runPrompt,
    readHistory = getRecentCommitMessages
  } = options
  if (model === null) return null
  await validateModel(model, options)
  const path = join(options.repoRoot, 'COMMITS.md')
  try {
    const existing = await readStyle(path)
    if (existing !== null) return existing
    if (!options.yes) {
      if (!options.hasTty) {
        options.onNote?.('No COMMITS.md found; skipping commit styles without a terminal or --yes.')
        return null
      }
      if (!(await (options.ask ?? askPermission)())) return null
    }
    const history = await readHistory()
    if (history.length === 0) {
      options.onNote?.('No commit history found; continuing without creating COMMITS.md.')
      return null
    }
    options.onPhase?.('Analyzing commit style')
    const result = await runner(buildCommitStyleUser(history), {
      model,
      system: buildCommitStyleSystem(),
      allowApiKey: options.allowApiKey,
      ...(options.abortController ? { abortController: options.abortController } : {})
    })
    if (options.abortController?.signal.aborted) throw new ClaudeCommitError('Generation was cancelled.')
    if (!result.text.trim()) throw new ClaudeCommitError('Commit style analysis returned an empty guide.')
    const style = `${result.text.trim()}\n`
    try {
      await writeFile(path, style, { flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const appeared = await readStyle(path)
      if (appeared === null) throw error
      options.onNote?.('COMMITS.md appeared during analysis; using it without overwriting.')
      return appeared
    }
    options.onNote?.('Created COMMITS.md from commit history. Review it to refine future commit messages.')
    return style
  } catch (error) {
    if (error instanceof ClaudeCommitError) throw error
    throw new ClaudeCommitError(`Could not set up COMMITS.md: ${(error as Error).message}`)
  }
}

async function readStyle(path: string): Promise<string | null> {
  try {
    if (!(await lstat(path)).isFile()) throw new ClaudeCommitError('COMMITS.md must be a regular file.')
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function askPermission(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await askLine(rl, "No COMMITS.md found. Create it from this repo's commit history? [Y/n] ")
    return answer !== null && ['', 'y', 'yes'].includes(answer.trim().toLowerCase())
  } finally {
    rl.close()
  }
}
