/**
 * Interactive mode: generate several candidate messages, then let the user pick
 * one (and optionally edit it) before committing.
 *
 * The picker is a `@clack/core` `SelectPrompt` with a custom, pure render
 * function ({@link renderPicker}): every candidate shows its subject line and a
 * one-line body preview, the list windows itself to the terminal height, and
 * two extra keys (`e` to edit, `q` to cancel) sit alongside Clack's defaults
 * (arrows, `j`/`k`, Enter, Escape, Ctrl-C). When the TypeSafe check ran, the
 * doubtful candidates arrive last, each with a warning line.
 * Everything is drawn on stderr so stdout stays clean. If the prompt cannot start for any reason, we fall back
 * to a plain readline question.
 */
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { isCancel, SelectPrompt, type State } from '@clack/core'
import {
  limitOptions,
  S_BAR,
  S_BAR_END,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  S_STEP_ACTIVE,
  S_STEP_CANCEL,
  S_STEP_SUBMIT
} from '@clack/prompts'
import { describeCandidateCheck, describeCheckNotices, type GenerateResult, generateCommit } from '../generate.ts'
import { commit } from '../git.ts'
import type { Config } from '../types.ts'
import { color } from './colors.ts'
import { askLine, editInEditor, type PromptIo } from './editor.ts'
import { Spinner } from './spinner.ts'

export interface InteractiveOptions {
  verbose: boolean
  /** Whether to animate progress; the CLI decides from `--no-spinner` and the TTY. */
  spinner: boolean
  abortController: AbortController
}

/** What the user decided in the picker. */
export type Selection = { action: 'commit' | 'edit'; index: number } | { action: 'cancel' }

/** Run the full interactive flow. Returns a process exit code. */
export async function runInteractive(diff: string, config: Config, opts: InteractiveOptions): Promise<number> {
  const count = Math.max(1, config.interactiveCount)
  const spinner = new Spinner(opts.spinner, config.spinner)
  spinner.start(`Generating ${count} option${count === 1 ? '' : 's'}`)
  let result: GenerateResult
  try {
    result = await generateCommit(diff, config, {
      count,
      progress: { onPhase: (label) => spinner.update(label) },
      abortController: opts.abortController
    })
  } catch (err) {
    spinner.stop()
    throw err
  }
  spinner.stop()

  const { messages, warnings, candidateCheck } = result
  for (const notice of describeCheckNotices(candidateCheck)) {
    process.stderr.write(`${color('33', `⚠ ${notice}`)}\n`)
  }

  let selection: Selection
  try {
    selection = await selectWithPrompt(messages, { warnings })
  } catch {
    // The prompt failed to start (unusual terminal, etc.) - degrade gracefully.
    selection = await selectWithReadline(messages, warnings)
  }

  if (selection.action === 'cancel') {
    process.stderr.write('Aborted. Nothing was committed.\n')
    return 1
  }

  const chosen = messages[selection.index]
  if (chosen === undefined) throw new Error(`Picker returned option ${selection.index} of ${messages.length}.`)
  let message = chosen
  if (selection.action === 'edit') {
    message = await editInEditor(message)
    if (message.trim() === '') {
      process.stderr.write('Aborted: empty commit message.\n')
      return 1
    }
  }

  await commit(message)
  process.stderr.write(`${color('32', '✔')} Committed\n${color('90', firstLine(message))}\n`)
  if (opts.verbose) {
    process.stderr.write(color('90', `cost $${result.costUsd.toFixed(4)}`) + '\n')
    if (candidateCheck?.status === 'checked') {
      process.stderr.write(color('90', describeCandidateCheck(candidateCheck)) + '\n')
    }
  }
  return 0
}

/**
 * The lifecycle states a Clack prompt renders in. Taken from Clack itself so
 * a state added upstream (as `validating` was) is handled by the default
 * branch of {@link renderPicker} instead of breaking the build.
 */
export type PickerState = State

/** Everything {@link renderPicker} needs to draw one frame. */
export interface PickerFrame {
  messages: string[]
  /** Warnings from the TypeSafe check, aligned with `messages`; omitted or empty when unchecked. */
  warnings?: string[][]
  /** Index of the highlighted candidate. */
  cursor: number
  state: PickerState
  /** The stream the frame is drawn on; its `columns`/`rows` bound the window. */
  output: Writable
}

const PICKER_TITLE = 'Pick a commit message'
const PICKER_HINTS = '↑/↓ select · ⏎ commit · e edit · q cancel'

/**
 * Rows the chrome around the candidate list occupies: the title, the hint
 * line, the closing bar, and the newline Clack writes when the prompt closes.
 * `limitOptions` keeps the list to the terminal height minus this.
 */
const PICKER_CHROME_ROWS = 4

/** Width of the `│  ` gutter every candidate line is drawn behind. */
const PICKER_GUTTER_COLUMNS = 3

/**
 * Draw one frame of the picker. Pure: the same inputs always give the same
 * string, which is what makes the layout testable without a terminal.
 *
 * While active, the candidate list is windowed around the cursor by Clack's
 * `limitOptions`, which counts the two lines each candidate occupies and
 * marks the hidden remainder with `...`. On submit or cancel the frame
 * collapses to the title and the chosen subject, matching the rest of
 * Clack's visual language.
 */
export function renderPicker(frame: PickerFrame): string {
  const { messages, warnings, cursor, state, output } = frame
  const chosen = firstLine(messages[cursor] ?? '')
  const dimBar = color('90', S_BAR)

  switch (state) {
    case 'submit':
      return [`${color('32', S_STEP_SUBMIT)}  ${PICKER_TITLE}`, `${dimBar}  ${color('90', chosen)}`].join('\n')
    case 'cancel':
      return [`${color('31', S_STEP_CANCEL)}  ${PICKER_TITLE}`, `${dimBar}  ${color('9;90', chosen)}`, dimBar].join(
        '\n'
      )
    default: {
      const bar = color('36', S_BAR)
      const rows = limitOptions({
        cursor,
        options: messages.map((message, index) => ({
          message,
          warnings: warnings?.[index] ?? []
        })),
        output,
        rowPadding: PICKER_CHROME_ROWS,
        columnPadding: PICKER_GUTTER_COLUMNS,
        style: renderCandidate
      })
      return [
        `${color('36', S_STEP_ACTIVE)}  ${PICKER_TITLE}`,
        `${bar}  ${color('90', PICKER_HINTS)}`,
        ...rows.map((row) => `${bar}  ${row}`),
        color('36', S_BAR_END),
        ''
      ].join('\n')
    }
  }
}

/**
 * One candidate: its subject with a radio glyph, then an indented body
 * preview, then any TypeSafe warnings on a line of their own.
 */
function renderCandidate(candidate: { message: string; warnings: string[] }, active: boolean): string {
  const { message, warnings } = candidate
  const glyph = active ? color('32', S_RADIO_ACTIVE) : color('90', S_RADIO_INACTIVE)
  const subject = active ? firstLine(message) : color('90', firstLine(message))
  const preview = bodyPreview(message)
  const previewLine = preview === '' ? '' : `\n  ${color('90', preview)}`
  const warningLine = warnings.length === 0 ? '' : `\n  ${color('33', `⚠ ${warnings.join(' · ')}`)}`
  return `${glyph} ${subject}${previewLine}${warningLine}`
}

/** The streams a prompt talks to (default stdin and stderr) and the candidates' warnings. */
export interface PromptOptions {
  input?: Readable
  output?: Writable
  /** Warnings from the TypeSafe check, aligned with the messages. */
  warnings?: string[][]
}

/**
 * The Clack picker. Resolves with the user's choice: Enter commits the
 * highlighted candidate, `e` edits it first, and `q`, Escape or Ctrl-C cancel.
 * Rejects only if the prompt cannot be created at all.
 */
export async function selectWithPrompt(messages: string[], options: PromptOptions = {}): Promise<Selection> {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stderr
  let action: 'commit' | 'edit' = 'commit'

  const prompt = new SelectPrompt<{ value: number }>({
    options: messages.map((_message, index) => ({ value: index })),
    initialValue: 0,
    input,
    output,
    render() {
      return renderPicker({
        messages,
        ...(options.warnings ? { warnings: options.warnings } : {}),
        cursor: this.cursor,
        state: this.state,
        output
      })
    }
  })

  // Clack finalises and closes the prompt on whichever state a key handler
  // sets, so the two custom keys need no more than this.
  prompt.on('key', (_char, key) => {
    if (key.ctrl || key.meta) return
    if (key.name === 'e') {
      action = 'edit'
      prompt.state = 'submit'
    } else if (key.name === 'q') {
      prompt.state = 'cancel'
    }
  })

  const result = await prompt.prompt()
  if (isCancel(result) || typeof result !== 'number') {
    return { action: 'cancel' }
  }
  return { action, index: result }
}

/** Plain-prompt fallback when the picker is unavailable. */
export async function selectWithReadline(
  messages: string[],
  warnings: string[][],
  io: PromptIo = {}
): Promise<Selection> {
  const input = io.input ?? process.stdin
  const output = io.output ?? process.stderr
  output.write('\nCandidate commit messages:\n')
  messages.forEach((message, index) => {
    output.write(`  ${index + 1}. ${firstLine(message)}\n`)
    const flagged = warnings[index] ?? []
    if (flagged.length > 0) output.write(`     ⚠ ${flagged.join(' · ')}\n`)
  })

  const rl = createInterface({ input, output })
  try {
    for (;;) {
      const answer = (await askLine(rl, `Choose 1-${messages.length}, "e N" to edit, or q to quit: `))
        ?.trim()
        .toLowerCase()

      if (answer === undefined || answer === 'q' || answer === '') return { action: 'cancel' }

      const editMatch = answer.match(/^e\s*(\d+)$/)
      if (editMatch) {
        const index = parseInt(editMatch[1] ?? '', 10) - 1
        if (index >= 0 && index < messages.length) return { action: 'edit', index }
      }

      const choice = parseInt(answer, 10)
      if (choice >= 1 && choice <= messages.length) {
        return { action: 'commit', index: choice - 1 }
      }
      output.write('Invalid choice.\n')
    }
  } finally {
    rl.close()
  }
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0] ?? text
}

/** A short, single-line preview of a message body (everything after the subject). */
function bodyPreview(text: string): string {
  const rest = text.split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim()
  return rest.length > 120 ? rest.slice(0, 117) + '…' : rest
}
