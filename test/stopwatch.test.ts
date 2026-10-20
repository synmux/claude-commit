import { describe, expect, test } from 'vitest'
import { COMMIT_SIZES, formatSeconds, syntheticDiff } from '../bin/stopwatch.ts'
import { diffPaths } from '../src/diff.ts'
import { estimateDiffTokens } from '../src/tokens.ts'

describe('syntheticDiff', () => {
  test('is a diff cco can read: every file section has a path', () => {
    const diff = syntheticDiff(COMMIT_SIZES.medium, 'seed-a')
    expect(diffPaths(diff)).toHaveLength(COMMIT_SIZES.medium.files)
    expect(diff.startsWith('diff --git a/')).toBe(true)
  })

  test('grows from small to medium to large', () => {
    const tokens = (['small', 'medium', 'large'] as const).map((size) =>
      estimateDiffTokens(syntheticDiff(COMMIT_SIZES[size], 'seed-a'), 3.5)
    )
    expect(tokens[0]).toBeLessThan(1_000)
    expect(tokens[1]).toBeGreaterThan(3_000)
    expect(tokens[2]).toBeGreaterThan(30_000)
  })

  test('is repeatable for a seed and different across seeds, from the first line', () => {
    const first = syntheticDiff(COMMIT_SIZES.small, 'seed-a')
    expect(syntheticDiff(COMMIT_SIZES.small, 'seed-a')).toBe(first)
    const other = syntheticDiff(COMMIT_SIZES.small, 'seed-b')
    // A different first line defeats prompt-prefix caching on the server.
    expect(other.split('\n', 1)[0]).not.toBe(first.split('\n', 1)[0])
  })
})

describe('formatSeconds', () => {
  test('shows tenths of a second, or a dash when nothing ran', () => {
    expect(formatSeconds(4321)).toBe('4.3 s')
    expect(formatSeconds(0)).toBe('0.0 s')
    expect(formatSeconds(undefined)).toBe('-')
  })
})
