import { afterEach, describe, expect, test, vi } from 'vitest'
import { playParty } from '../src/ui/party.ts'

const originalPartyTime = process.env.PARTY_TIME
const originalIsTty = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')

afterEach(() => {
  if (originalPartyTime === undefined) {
    delete process.env.PARTY_TIME
  } else {
    process.env.PARTY_TIME = originalPartyTime
  }
  if (originalIsTty === undefined) {
    delete (process.stderr as { isTTY?: boolean }).isTTY
  } else {
    Object.defineProperty(process.stderr, 'isTTY', originalIsTty)
  }
  vi.useRealTimers()
})

function setStderrTty(isTTY: boolean): void {
  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    value: isTTY
  })
}

function spyOnStderr(): { writes: string[]; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stderr.write)
  return { writes, restore: () => spy.mockRestore() }
}

describe('playParty', () => {
  test('does nothing when PARTY_TIME is unset', async () => {
    delete process.env.PARTY_TIME
    setStderrTty(true)
    const stderr = spyOnStderr()
    try {
      await playParty(new AbortController().signal)
      expect(stderr.writes).toEqual([])
    } finally {
      stderr.restore()
    }
  })

  test.each(['1', 'true', 'TRUE', 'yes', 'on'])('animates when PARTY_TIME is set to %j', async (value) => {
    process.env.PARTY_TIME = value
    setStderrTty(true)
    vi.useFakeTimers()
    const stderr = spyOnStderr()
    const stdout = vi.spyOn(process.stdout, 'write')
    try {
      const animation = playParty(new AbortController().signal)
      await vi.runAllTimersAsync()
      await animation
      const output = stderr.writes.join('')
      expect(output).toContain('PARTY TIME!')
      expect(output.match(/PARTY TIME!/g)).toHaveLength(8)
      expect(output).toContain('\x1b[?25l')
      expect(output).toContain('\x1b[?25h')
      expect(stdout).not.toHaveBeenCalled()
    } finally {
      stderr.restore()
      stdout.mockRestore()
    }
  })

  test.each(['', '0', 'false', ' false ', 'off', 'no'])(
    'does not animate when PARTY_TIME is set to %j',
    async (value) => {
      process.env.PARTY_TIME = value
      setStderrTty(true)
      vi.useFakeTimers()
      const stderr = spyOnStderr()
      try {
        await playParty(new AbortController().signal)
        expect(stderr.writes).toEqual([])
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        stderr.restore()
      }
    }
  )

  test('does not animate or delay when stderr is not a TTY', async () => {
    process.env.PARTY_TIME = '1'
    setStderrTty(false)
    vi.useFakeTimers()
    const stderr = spyOnStderr()
    try {
      await playParty(new AbortController().signal)
      expect(stderr.writes).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      stderr.restore()
    }
  })

  test('cleans up when the run is aborted during animation', async () => {
    process.env.PARTY_TIME = '1'
    setStderrTty(true)
    vi.useFakeTimers()
    const controller = new AbortController()
    const stderr = spyOnStderr()
    try {
      const animation = playParty(controller.signal)
      await vi.advanceTimersByTimeAsync(180)
      controller.abort()
      await animation
      const output = stderr.writes.join('')
      expect(output).toContain('PARTY TIME!')
      expect(output).toContain('\r\x1b[2K\x1b[?25h')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      stderr.restore()
    }
  })
})
