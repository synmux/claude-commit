import spinners from 'cli-spinners'
import { describe, expect, test, vi } from 'vitest'
import { DEFAULT_SPINNER, isSpinnerName, resolveSpinner, Spinner, spinnerEnabled } from '../src/ui/spinner.ts'

describe('isSpinnerName', () => {
  test('recognises cli-spinners names', () => {
    expect(isSpinnerName('material')).toBe(true)
    expect(isSpinnerName('dots')).toBe(true)
  })

  test('rejects unknown names, including inherited object keys', () => {
    expect(isSpinnerName('not-a-spinner')).toBe(false)
    expect(isSpinnerName('toString')).toBe(false)
  })
})

describe('resolveSpinner', () => {
  test('returns the animation for a known name', () => {
    expect(resolveSpinner('dots')).toEqual(spinners.dots)
  })

  test('falls back to the default animation for unknown names', () => {
    expect(resolveSpinner('not-a-spinner')).toEqual(spinners[DEFAULT_SPINNER])
  })

  test('the default spinner is material', () => {
    expect(DEFAULT_SPINNER).toBe('material')
    expect(resolveSpinner(DEFAULT_SPINNER)).toEqual(spinners.material)
  })
})

describe('Spinner when disabled (no TTY / --no-spinner)', () => {
  test('start/update/stop write nothing, but final lines still print', () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk))
      return true
    }) as typeof process.stderr.write)
    try {
      const spinner = new Spinner(false, 'dots')
      spinner.start('working')
      spinner.update('still working')
      spinner.stop()
      expect(writes).toEqual([])

      spinner.succeed('done')
      expect(writes.join('')).toContain('done')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('spinnerEnabled', () => {
  test('animates only on a TTY and only unless --no-spinner was given', () => {
    expect(spinnerEnabled(undefined, { isTTY: true })).toBe(true)
    expect(spinnerEnabled(true, { isTTY: true })).toBe(true)
    expect(spinnerEnabled(false, { isTTY: true })).toBe(false)
    expect(spinnerEnabled(undefined, {})).toBe(false)
    expect(spinnerEnabled(undefined, { isTTY: false })).toBe(false)
  })
})
