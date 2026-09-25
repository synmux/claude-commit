import { PassThrough, Writable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { S_RADIO_ACTIVE, S_RADIO_INACTIVE, S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_SUBMIT } from '@clack/prompts'
import { describe, expect, test } from 'vitest'
import { renderPicker, selectWithPrompt } from '../src/ui/interactive.ts'

const messages = [
  'feat(alpha): first candidate subject line\n\nBody one preview.',
  'fix(bravo): second candidate subject line\n\nBody two preview.',
  'refactor(charlie): third candidate subject line\n\nBody three preview.'
]

const subject = (message: string): string => message.split('\n', 1)[0]!

/**
 * A stand-in for a terminal: a writable that remembers everything written
 * to it and reports a size, as Clack reads `columns`/`rows` off the output
 * stream when windowing options.
 */
function fakeOutput(columns: number, rows: number) {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk))
      callback()
    }
  }) as Writable & { columns: number; rows: number }
  stream.columns = columns
  stream.rows = rows
  return { stream, text: () => chunks.join('') }
}

describe('renderPicker', () => {
  const output = fakeOutput(120, 40).stream

  test("lists every candidate's subject and body preview", () => {
    const frame = renderPicker({
      messages,
      cursor: 0,
      state: 'active',
      output
    })
    for (const message of messages) {
      expect(frame).toContain(subject(message))
    }
    expect(frame).toContain('Body one preview.')
    expect(frame).toContain('Body three preview.')
  })

  test('marks the cursor row active and every other row inactive', () => {
    const frame = renderPicker({
      messages,
      cursor: 1,
      state: 'active',
      output
    })
    const lines = frame.split('\n')
    const subjectLine = (message: string) => lines.find((line) => line.includes(subject(message)))!
    expect(subjectLine(messages[1]!)).toContain(S_RADIO_ACTIVE)
    for (const other of [messages[0]!, messages[2]!]) {
      expect(subjectLine(other)).toContain(S_RADIO_INACTIVE)
      expect(subjectLine(other)).not.toContain(S_RADIO_ACTIVE)
    }
  })

  test('shows the title and key hints while active', () => {
    const frame = renderPicker({
      messages,
      cursor: 0,
      state: 'active',
      output
    })
    expect(frame).toContain(`${S_STEP_ACTIVE}  Pick a commit message`)
    expect(frame).toContain('↑/↓ select')
    expect(frame).toContain('⏎ commit')
    expect(frame).toContain('e edit')
    expect(frame).toContain('q cancel')
  })

  test('on submit collapses to the chosen subject', () => {
    const frame = renderPicker({
      messages,
      cursor: 2,
      state: 'submit',
      output
    })
    expect(frame).toContain(S_STEP_SUBMIT)
    expect(frame).toContain(subject(messages[2]!))
    expect(frame).not.toContain(subject(messages[0]!))
    expect(frame).not.toContain('↑/↓ select')
  })

  test('on cancel shows the cancel glyph and no candidates', () => {
    const frame = renderPicker({
      messages,
      cursor: 0,
      state: 'cancel',
      output
    })
    expect(frame).toContain(S_STEP_CANCEL)
    expect(frame).not.toContain(subject(messages[1]!))
  })

  test('truncates a long body preview to a single line with an ellipsis', () => {
    const longBody = 'word '.repeat(80).trim()
    const frame = renderPicker({
      messages: [`feat: long body\n\n${longBody}`],
      cursor: 0,
      state: 'active',
      output: fakeOutput(500, 40).stream
    })
    const previewLine = frame.split('\n').find((line) => line.includes('word'))
    expect(previewLine).toContain('…')
    expect(previewLine).not.toContain(longBody)
  })

  test('windows the list around the cursor when candidates overflow the terminal', () => {
    const many = Array.from(
      { length: 12 },
      (_, index) => `feat: candidate option number ${index + 1}\n\nBody ${index + 1}.`
    )
    const small = fakeOutput(80, 14).stream
    const frame = renderPicker({
      messages: many,
      cursor: 11,
      state: 'active',
      output: small
    })
    expect(frame).toContain('candidate option number 12')
    expect(frame).not.toContain('candidate option number 1\n')
    expect(frame).toContain('...')
    // Never taller than the terminal it was measured for.
    expect(frame.split('\n').length).toBeLessThanOrEqual(14)
  })
})

describe('selectWithPrompt', () => {
  function terminal() {
    const input = new PassThrough()
    const output = fakeOutput(100, 30)
    return { input, output }
  }

  /** Feed key sequences one at a time, yielding between them so readline settles. */
  async function press(input: PassThrough, ...keys: string[]): Promise<void> {
    for (const key of keys) {
      input.write(key)
      await sleep(5)
    }
  }

  test('Enter commits the first candidate', async () => {
    const { input, output } = terminal()
    const pending = selectWithPrompt(messages, {
      input,
      output: output.stream
    })
    await press(input, '\r')
    await expect(pending).resolves.toEqual({ action: 'commit', index: 0 })
    expect(output.text()).toContain('Pick a commit message')
  })

  test('arrow and vim keys move the cursor before Enter', async () => {
    const { input, output } = terminal()
    const pending = selectWithPrompt(messages, {
      input,
      output: output.stream
    })
    await press(input, '\x1b[B', 'j', '\r')
    await expect(pending).resolves.toEqual({ action: 'commit', index: 2 })
  })

  test('moving up from the first candidate wraps to the last', async () => {
    const { input, output } = terminal()
    const pending = selectWithPrompt(messages, {
      input,
      output: output.stream
    })
    await press(input, '\x1b[A', '\r')
    await expect(pending).resolves.toEqual({ action: 'commit', index: 2 })
  })

  test('e edits the highlighted candidate', async () => {
    const { input, output } = terminal()
    const pending = selectWithPrompt(messages, {
      input,
      output: output.stream
    })
    await press(input, '\x1b[B', 'e')
    await expect(pending).resolves.toEqual({ action: 'edit', index: 1 })
  })

  test('q cancels', async () => {
    const { input, output } = terminal()
    const pending = selectWithPrompt(messages, {
      input,
      output: output.stream
    })
    await press(input, 'q')
    await expect(pending).resolves.toEqual({ action: 'cancel' })
  })

  test('Ctrl-C cancels without touching the exit code', async () => {
    const { input, output } = terminal()
    const pending = selectWithPrompt(messages, {
      input,
      output: output.stream
    })
    await press(input, '\x03')
    await expect(pending).resolves.toEqual({ action: 'cancel' })
    expect(process.exitCode).toBeUndefined()
  })

  test('Escape cancels', async () => {
    const { input, output } = terminal()
    const pending = selectWithPrompt(messages, {
      input,
      output: output.stream
    })
    input.write('\x1b')
    // readline holds a lone ESC for its 50ms escape-sequence timeout.
    await sleep(80)
    await expect(pending).resolves.toEqual({ action: 'cancel' })
  })

  test('writes nothing to stdout', async () => {
    const { input, output } = terminal()
    const written: string[] = []
    const original = process.stdout.write
    process.stdout.write = ((chunk: unknown) => {
      written.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      const pending = selectWithPrompt(messages, {
        input,
        output: output.stream
      })
      await press(input, '\r')
      await pending
    } finally {
      process.stdout.write = original
    }
    expect(written).toEqual([])
  })
})
