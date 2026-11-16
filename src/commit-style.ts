import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, open, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { runPrompt, validateCommitStyleModel } from './agent.ts'
import { ClaudeCommitError } from './errors.ts'
import { getRecentCommitMessages } from './git.ts'
import { buildCommitStyleSystem, buildCommitStyleUser } from './prompts.ts'
import { CONTEXT_RESERVE_TOKENS, contextWindowTokens } from './tokens.ts'
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
  await validateModel(model, {
    allowApiKey: options.allowApiKey,
    abortController: options.abortController
  })
  const path = join(options.repoRoot, 'COMMITS.md')
  try {
    const existing = await readStyle(path)
    if (existing !== null) return activeStyle(existing, options.onNote)
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
    const result = await runner(buildCommitStyleUser(budgetHistory(history, model)), {
      model,
      system: buildCommitStyleSystem(),
      allowApiKey: options.allowApiKey,
      ...(options.abortController ? { abortController: options.abortController } : {})
    })
    if (options.abortController?.signal.aborted) throw new ClaudeCommitError('Generation was cancelled.')
    if (!result.text.trim()) throw new ClaudeCommitError('Commit style analysis returned an empty guide.')
    const style = `${result.text.trim()}\n`
    const temporary = join(options.repoRoot, `.COMMITS.md.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, style, { flag: 'wx' })
      await link(temporary, path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const appeared = await readStyle(path)
      if (appeared === null) throw error
      options.onNote?.('COMMITS.md appeared during analysis; leaving it unchanged.')
      return activeStyle(appeared, options.onNote)
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
    options.onNote?.('Created COMMITS.md from commit history. Review it to refine future commit messages.')
    return style
  } catch (error) {
    if (error instanceof ClaudeCommitError) throw error
    throw new ClaudeCommitError(`Could not set up COMMITS.md: ${(error as Error).message}`)
  }
}

function budgetHistory(messages: string[], model: string): string[] {
  // JSON escaping needs up to six bytes per UTF-16 unit; allow one byte per token.
  let remaining = Math.floor((contextWindowTokens(model) - CONTEXT_RESERVE_TOKENS) / 6)
  const marker = '\n[Message truncated]'
  const history: string[] = []
  for (const message of messages) {
    if (remaining <= marker.length + 3) break
    const truncated = message.length + 3 > remaining
    const content = truncated ? message.slice(0, remaining - marker.length - 3) + marker : message
    history.push(content)
    remaining -= content.length + 3
    if (truncated) break
  }
  return history
}

function activeStyle(style: string, onNote: CommitStyleOptions['onNote']): string | null {
  if (style.trim()) return style
  onNote?.('COMMITS.md is empty; continuing without repository style.')
  return null
}

async function readStyle(path: string): Promise<string | null> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      if (!(await file.stat()).isFile()) throw new ClaudeCommitError('COMMITS.md must be a regular file.')
      return await file.readFile('utf8')
    } finally {
      await file.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new ClaudeCommitError('COMMITS.md must be a regular file.')
    }
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
