import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, test } from 'vitest'
import { confirmCommit } from '../src/ui/editor.ts'
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
