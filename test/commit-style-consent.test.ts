import { PassThrough } from 'node:stream'
import { expect, test } from 'vitest'
import { askCommitStylePermission } from '../src/commit-style.ts'

function terminal() {
  const input = Object.assign(new PassThrough(), { isTTY: true })
  const output = Object.assign(new PassThrough(), { isTTY: true })
  output.resume()
  return { input, output }
}

test('Ctrl-C cancels consent and aborts the run instead of declining', async () => {
  const io = terminal()
  const controller = new AbortController()
  const pending = askCommitStylePermission(controller, io)
  io.input.write('\x03')
  await expect(pending).rejects.toThrow('Generation was cancelled.')
  expect(controller.signal.aborted).toBe(true)
})

test('Ctrl-C cancels even without an abort controller', async () => {
  const io = terminal()
  const pending = askCommitStylePermission(undefined, io)
  io.input.write('\x03')
  await expect(pending).rejects.toThrow('Generation was cancelled.')
})

test('EOF settles consent as declined without aborting', async () => {
  const io = terminal()
  const controller = new AbortController()
  const pending = askCommitStylePermission(controller, io)
  io.input.end()
  await expect(pending).resolves.toBe(false)
  expect(controller.signal.aborted).toBe(false)
})

test.each([
  ['y\n', true],
  ['n\n', false]
] as const)('consent answer %j resolves normally', async (answer, expected) => {
  const io = terminal()
  const pending = askCommitStylePermission(undefined, io)
  io.input.write(answer)
  await expect(pending).resolves.toBe(expected)
})

test('an external abort closes and settles the prompt', async () => {
  const io = terminal()
  const controller = new AbortController()
  const pending = askCommitStylePermission(controller, io)
  controller.abort()
  await expect(pending).rejects.toThrow('Generation was cancelled.')
})
