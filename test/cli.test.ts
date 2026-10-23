import { describe, expect, test } from 'vitest'
import {
  buildProgram,
  describeIgnoreStats,
  describeLowPriorityStats,
  flagsToConfig,
  resolveInteractiveMode
} from '../src/cli.ts'
import { resolveConfig } from '../src/config.ts'

describe('filenames-only flags', () => {
  test.each(['-f', '--filenames-only'])('%s enables the mode', (flag) => {
    const program = buildProgram()
    program.parse([flag], { from: 'user' })
    const flags = flagsToConfig(program.opts())
    expect(flags.filenamesOnly).toBe(true)
    expect(resolveConfig({ filenamesOnly: false }, flags).filenamesOnly).toBe(true)
  })

  test('omitting the flag preserves the configured mode', () => {
    const program = buildProgram()
    program.parse([], { from: 'user' })
    const flags = flagsToConfig(program.opts())
    expect(flags.filenamesOnly).toBeUndefined()
    expect(resolveConfig({ filenamesOnly: true }, flags).filenamesOnly).toBe(true)
    expect(resolveConfig({}, flags).filenamesOnly).toBe(false)
  })
})

describe('typesafe flags', () => {
  test('--typesafe turns the check on over config', () => {
    const program = buildProgram()
    program.parse(['--typesafe'], { from: 'user' })
    const config = resolveConfig({ typesafe: { env: '__TYPESAFE_API_KEY' } }, flagsToConfig(program.opts()))
    expect(config.typesafe.enable).toBe(true)
    expect(config.typesafe.env).toBe('__TYPESAFE_API_KEY')
  })

  test('--no-typesafe turns a configured check off', () => {
    const program = buildProgram()
    program.parse(['--no-typesafe'], { from: 'user' })
    expect(resolveConfig({ typesafe: { enable: true } }, flagsToConfig(program.opts())).typesafe.enable).toBe(false)
  })

  test('omitting both leaves the configured setting', () => {
    const program = buildProgram()
    program.parse([], { from: 'user' })
    expect(flagsToConfig(program.opts()).typesafe).toBeUndefined()
  })
})

describe('resolveInteractiveMode', () => {
  const base = {
    configInteractive: false,
    interactiveFlag: undefined as boolean | undefined,
    dryRun: false,
    hasTty: true
  }

  test('stays non-interactive when nothing enables it', () => {
    expect(resolveInteractiveMode(base)).toBe('non-interactive')
  })

  test('config-enabled on a TTY runs the picker', () => {
    expect(resolveInteractiveMode({ ...base, configInteractive: true })).toBe('interactive')
  })

  test('an explicit -i flag on a TTY runs the picker', () => {
    // The flag is folded into config precedence before this point, so both are set.
    expect(
      resolveInteractiveMode({
        ...base,
        configInteractive: true,
        interactiveFlag: true
      })
    ).toBe('interactive')
  })

  test('--dry-run always wins, even with -i on a TTY', () => {
    expect(
      resolveInteractiveMode({
        configInteractive: true,
        interactiveFlag: true,
        dryRun: true,
        hasTty: true
      })
    ).toBe('non-interactive')
  })

  test('an explicit -i without a TTY is a hard error', () => {
    expect(
      resolveInteractiveMode({
        configInteractive: true,
        interactiveFlag: true,
        dryRun: false,
        hasTty: false
      })
    ).toBe('no-tty-error')
  })

  test('config-driven interactive without a TTY falls back quietly', () => {
    expect(
      resolveInteractiveMode({
        configInteractive: true,
        interactiveFlag: undefined,
        dryRun: false,
        hasTty: false
      })
    ).toBe('non-interactive')
  })

  test('--no-interactive (config resolved to false) skips the picker on a TTY', () => {
    expect(
      resolveInteractiveMode({
        configInteractive: false,
        interactiveFlag: false,
        dryRun: false,
        hasTty: true
      })
    ).toBe('non-interactive')
  })
})

describe('--no-low-priority-paths', () => {
  test('parses to lowPriorityPaths: false and maps to an empty list', () => {
    const program = buildProgram()
    program.parse(['--no-low-priority-paths'], { from: 'user' })
    const opts = program.opts<{ lowPriorityPaths?: boolean }>()
    expect(opts.lowPriorityPaths).toBe(false)
    expect(flagsToConfig(opts).lowPriorityPaths).toEqual([])
  })

  test('is left unset when the flag is absent', () => {
    const program = buildProgram()
    program.parse([], { from: 'user' })
    const opts = program.opts<{ lowPriorityPaths?: boolean }>()
    expect(flagsToConfig(opts).lowPriorityPaths).toBeUndefined()
  })
})

describe('describeLowPriorityStats', () => {
  test('distinguishes none, some and all-promoted', () => {
    expect(
      describeLowPriorityStats({
        matchedFiles: 0,
        totalFiles: 3,
        promoted: false
      })
    ).toBe('low-priority paths: matched none of 3 files')
    expect(
      describeLowPriorityStats({
        matchedFiles: 2,
        totalFiles: 3,
        promoted: false
      })
    ).toBe('low-priority paths: matched 2 of 3 files')
    expect(
      describeLowPriorityStats({
        matchedFiles: 1,
        totalFiles: 1,
        promoted: true
      })
    ).toBe('low-priority paths: matched all 1 file - nothing else changed, so treated as primary')
  })
})

describe('ignore flags', () => {
  test('--no-ignore clears the configured patterns for one run', () => {
    expect(flagsToConfig({ ignore: false }).ignore).toEqual([])
  })

  test('leaving the flag off does not touch the config', () => {
    expect(flagsToConfig({}).ignore).toBeUndefined()
  })

  test('the program accepts --no-ignore', () => {
    const program = buildProgram()
    program.parse(['--no-ignore'], { from: 'user' })
    expect(program.opts().ignore).toBe(false)
  })
})

describe('model flags', () => {
  test('a model id passes through --model-summary unchanged', () => {
    const program = buildProgram()
    program.parse(['--model-summary', 'claude-haiku-4-5'], {
      from: 'user'
    })
    expect(flagsToConfig(program.opts()).models).toEqual({
      summary: 'claude-haiku-4-5'
    })
  })
})

describe('describeIgnoreStats', () => {
  test('distinguishes a pattern that matched nothing', () => {
    expect(describeIgnoreStats({ ignoredFiles: 0, totalFiles: 12 })).toBe('ignore: matched none of 12 files')
  })

  test('reports what it removed', () => {
    expect(describeIgnoreStats({ ignoredFiles: 3, totalFiles: 12 })).toBe(
      'ignore: dropped 3 of 12 files before reading'
    )
  })

  test('gets the singular right', () => {
    expect(describeIgnoreStats({ ignoredFiles: 1, totalFiles: 1 })).toBe('ignore: dropped 1 of 1 file before reading')
  })
})
