import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, test } from 'vitest'
import { canPrompt, confirmCommit, editInEditor, editorStdio } from '../src/ui/editor.ts'
import { selectWithReadline } from '../src/ui/interactive.ts'

/** Streams standing in for stdin/stderr; `tty` makes readline treat them as a terminal. */
function fakeIo(tty = false) {
  const input = new PassThrough() as PassThrough & { isTTY?: boolean }
  const output = new PassThrough() as PassThrough & { isTTY?: boolean }
  output.resume()
  if (tty) {
    input.isTTY = true
    output.isTTY = true
  }
  return { input, output }
}

describe('editInEditor', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env.GIT_EDITOR = saved.GIT_EDITOR
    if (saved.GIT_EDITOR === undefined) delete process.env.GIT_EDITOR
  })

  test('returns what the editor saved', async () => {
    process.env.GIT_EDITOR = `sh -c 'printf "edited" > "$0"'`
    await expect(editInEditor('original')).resolves.toBe('edited')
  })

  test('an editor killed by a signal is an error, not a successful edit', async () => {
    // The user pressed Ctrl-C while `code --wait` (or any waiting editor)
    // was open: the editor dies from the signal with the file untouched.
    process.env.GIT_EDITOR = `exec sh -c 'kill -TERM $$'`
    await expect(editInEditor('original')).rejects.toThrow(/SIGTERM.*nothing was committed/i)
  })
})

describe('editorStdio', () => {
  test('the editor shares the terminal when stdout is one', () => {
    expect(editorStdio({ isTTY: true })).toEqual(['inherit', 'inherit', 'inherit'])
  })

  test('the editor draws on stderr when stdout is redirected, so `cco > log` is not edited blind', () => {
    expect(editorStdio({ isTTY: false })).toEqual(['inherit', 2, 'inherit'])
  })
})

describe('canPrompt', () => {
  const streams = (stdin: boolean, stdout: boolean, stderr: boolean) => ({
    stdin: { isTTY: stdin },
    stdout: { isTTY: stdout },
    stderr: { isTTY: stderr }
  })

  test('ignores stdout: a redirected or piped stdout still leaves a prompt usable', () => {
    expect(canPrompt(streams(true, false, true))).toBe(true)
  })

  test('needs stdin to read the answer', () => {
    expect(canPrompt(streams(false, true, true))).toBe(false)
  })

  test('needs stderr to show the question', () => {
    expect(canPrompt(streams(true, true, false))).toBe(false)
  })
})

describe('confirmCommit', () => {
  test('answers y, n and e', async () => {
    for (const [typed, expected] of [
      ['\n', 'yes'],
      ['n\n', 'no'],
      ['e\n', 'edit']
    ] as const) {
      const io = fakeIo()
      const pending = confirmCommit(io)
      io.input.write(typed)
      await expect(pending).resolves.toBe(expected)
    }
  })

  test('Ctrl-D (stdin closing) counts as no instead of hanging', async () => {
    const io = fakeIo()
    const pending = confirmCommit(io)
    io.input.end()
    await expect(pending).resolves.toBe('no')
  })

  test('Ctrl-C in a terminal counts as no instead of hanging', async () => {
    const io = fakeIo(true)
    const pending = confirmCommit(io)
    io.input.write('\x03')
    await expect(pending).resolves.toBe('no')
  })
})

describe('selectWithReadline', () => {
  const messages = ['feat: one', 'fix: two']

  test('picks and edits by number', async () => {
    const pick = fakeIo()
    const picking = selectWithReadline(messages, [], pick)
    pick.input.write('2\n')
    await expect(picking).resolves.toEqual({ action: 'commit', index: 1 })

    const edit = fakeIo()
    const editing = selectWithReadline(messages, [], edit)
    edit.input.write('e 1\n')
    await expect(editing).resolves.toEqual({ action: 'edit', index: 0 })
  })

  test('Ctrl-D (stdin closing) cancels instead of hanging', async () => {
    const io = fakeIo()
    const pending = selectWithReadline(messages, [], io)
    io.input.end()
    await expect(pending).resolves.toEqual({ action: 'cancel' })
  })

  test('Ctrl-C in a terminal cancels instead of hanging', async () => {
    const io = fakeIo(true)
    const pending = selectWithReadline(messages, [], io)
    io.input.write('\x03')
    await expect(pending).resolves.toEqual({ action: 'cancel' })
  })
})
