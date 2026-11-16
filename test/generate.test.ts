import { describe, expect, test, vi } from 'vitest'
import type { runPrompt } from '../src/agent.ts'
import { DEFAULT_CONFIG } from '../src/config.ts'
import { ClaudeCommitError } from '../src/errors.ts'
import { describeCheckNotices, generateCommit, prepareCommitDiff } from '../src/generate.ts'
import { availableContextTokens, estimateDiffTokens } from '../src/tokens.ts'
import type { Config, ModelResult } from '../src/types.ts'
import { answeringJevFetch, fakeJevFetch, jevAnswers } from './typesafe-fixtures.ts'

type Runner = typeof runPrompt

const baseConfig: Config = { ...DEFAULT_CONFIG }

const armorLine = (index: number) => `+${'Ab9Xy'.repeat(13)}${String(index % 10).repeat(4)}`

const armorDiff = (lines: number) =>
  [
    'diff --git a/secret.age b/secret.age',
    'index 111..222 100644',
    '--- a/secret.age',
    '+++ b/secret.age',
    `@@ -1,${lines} +1,${lines} @@`,
    ...Array.from({ length: lines }, (_, index) => armorLine(index))
  ].join('\n')

const textDiff = `diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
 context
-old line
+new line`

describe('commit style propagation', () => {
  test.each([false, true])(
    'every preparation/final/fallback call receives style (filenamesOnly=%s)',
    async (filenamesOnly) => {
      const systems: string[] = []
      let summaries = 0
      let finals = 0
      const runner: Runner = async (_prompt, options) => {
        systems.push(options.system)
        if (options.system.includes('Do not write a commit message')) {
          summaries++
          return { text: 'Changed content', costUsd: 0 }
        }
        finals++
        if (options.outputFormat) throw new ClaudeCommitError('structured unavailable')
        return {
          text: 'First subject\n===OPTION===\nSecond subject',
          costUsd: 0
        }
      }
      const diff = `${textDiff}\n${textDiff.replaceAll('a.txt', 'generated.lock')}`
      const result = await generateCommit(
        diff,
        { ...baseConfig, filenamesOnly, lowPriorityPaths: ['*.lock'] },
        {
          runner,
          count: 2,
          commitStyle: 'Use the repository voice.'
        }
      )
      expect(result.messages).toHaveLength(2)
      expect(summaries).toBe(filenamesOnly ? 0 : 2)
      expect(finals).toBe(2)
      expect(systems.every((system) => system.includes('Use the repository voice.'))).toBe(true)
    }
  )
})

/** One summary-stage request as seen by the stub runner. */
interface SummaryCall {
  prompt: string
  system: string
}

/**
 * Runner stub mirroring the real contract: summary calls (no outputFormat)
 * return text, final-stage structured calls return a schema-shaped message
 * list. `beforeCall` can throw to simulate backend rejections. Every
 * summary request is recorded (prompt and system prompt) along with the
 * final-stage prompt, so tests can assert on what reached each stage.
 */
function stubRunner(beforeCall?: (prompt: string, summaryCallIndex: number) => void): {
  runner: Runner
  summaryPrompts: string[]
  summaryCalls: SummaryCall[]
  finalPrompts: string[]
} {
  const summaryPrompts: string[] = []
  const summaryCalls: SummaryCall[] = []
  const finalPrompts: string[] = []
  const runner: Runner = async (prompt, opts): Promise<ModelResult> => {
    if (opts.outputFormat) {
      finalPrompts.push(prompt)
      return {
        text: '',
        costUsd: 0.001,
        structured: { messages: ['fix: stubbed message'] }
      }
    }
    beforeCall?.(prompt, summaryPrompts.length)
    summaryPrompts.push(prompt)
    summaryCalls.push({ prompt, system: opts.system })
    return { text: `summary of ${prompt.length} chars`, costUsd: 0.002 }
  }
  return { runner, summaryPrompts, summaryCalls, finalPrompts }
}

const LOW_PRIORITY_SYSTEM = /low[- ]priority/i

/** A generated skill doc under the path this repo deprioritises. */
const skillDiff = [
  'diff --git a/.agents/skills/ora-skilld/SKILL.md b/.agents/skills/ora-skilld/SKILL.md',
  'index 111..222 100644',
  '--- a/.agents/skills/ora-skilld/SKILL.md',
  '+++ b/.agents/skills/ora-skilld/SKILL.md',
  '@@ -1,2 +1,2 @@',
  ' # ora',
  '-generated 2026-07-01',
  '+generated 2026-08-24'
].join('\n')

const lowPriorityConfig: Config = {
  ...baseConfig,
  lowPriorityPaths: ['.agents/skills/*-skilld', '*.age']
}

const promptTooLong = () =>
  new ClaudeCommitError(
    'Failed to call the Claude Agent SDK: Claude Code returned an error ' +
      'result: Prompt is too long · the request is ~1188235 tokens (limit 1000000)'
  )

describe('generateCommit', () => {
  test.each([
    { summary: 'haiku', final: 'sonnet', filenamesOnly: false },
    { summary: 'sonnet', final: 'haiku', filenamesOnly: false },
    { summary: 'haiku', final: 'haiku', filenamesOnly: true }
  ])('rejects unusably small guide budgets before model calls: %j', async (settings) => {
    const runner = vi.fn<Runner>(async () => {
      throw new Error('model must not run')
    })
    const config = {
      ...baseConfig,
      models: settings,
      filenamesOnly: settings.filenamesOnly
    }
    await expect(
      generateCommit(textDiff, config, {
        runner,
        commitStyle: 'x'.repeat(167_000)
      })
    ).rejects.toThrow(/COMMITS.md leaves no room.*Shorten COMMITS.md/)
    expect(runner).not.toHaveBeenCalled()
  })

  test('reuses prepared diff and resolved key without reading either input again', async () => {
    const config = {
      ...baseConfig,
      typesafe: { ...baseConfig.typesafe, enable: true }
    }
    const { runner } = stubRunner()
    const { fetch } = answeringJevFetch()
    const options = {
      runner,
      typesafeFetch: fetch,
      preparedDiff: prepareCommitDiff(textDiff, config),
      typesafeKey: 'ts-key',
      env: new Proxy(
        {},
        {
          get() {
            throw new Error('key resolved twice')
          }
        }
      )
    }
    const result = await generateCommit('', config, options)
    expect(result.messages).toEqual(['fix: stubbed message'])
  })

  test('filenames-only mode ignores the unused summary budget', async () => {
    const { runner } = stubRunner()
    const config = {
      ...baseConfig,
      filenamesOnly: true,
      models: { summary: 'haiku', final: 'sonnet' }
    }
    const result = await generateCommit(textDiff, config, {
      runner,
      commitStyle: 'x'.repeat(167_000)
    })
    expect(result.chunkCount).toBe(0)
    expect(result.messages).toEqual(['fix: stubbed message'])
  })

  test('accepts the usable guide budget floor', async () => {
    const { runner } = stubRunner()
    const config = {
      ...baseConfig,
      models: { summary: 'haiku', final: 'haiku' }
    }
    const result = await generateCommit(textDiff, config, {
      runner,
      commitStyle: 'x'.repeat(159_999)
    })
    expect(result.messages).toEqual(['fix: stubbed message'])
  })
  test.each([
    { summary: 'haiku', final: 'sonnet', filenamesOnly: false },
    { summary: 'sonnet', final: 'haiku', filenamesOnly: false },
    { summary: 'haiku', final: 'haiku', filenamesOnly: true }
  ])('rejects a guide that fills a used model before any call: %j', async ({ summary, final, filenamesOnly }) => {
    const runner = vi.fn<Runner>()
    const config = {
      ...baseConfig,
      models: { summary, final, commits: null },
      filenamesOnly
    }
    await expect(
      generateCommit(textDiff, config, {
        runner,
        commitStyle: 'x'.repeat(168_000)
      })
    ).rejects.toThrow(/Shorten COMMITS.md/)
    expect(runner).not.toHaveBeenCalled()
  })

  test('guide tokens reduce the summary chunk budget', async () => {
    const commitStyle = 'x'.repeat(140_000)
    const config = {
      ...baseConfig,
      models: { ...baseConfig.models, summary: 'haiku' },
      maxChunkTokens: 100_000
    }
    const { runner, summaryPrompts } = stubRunner()
    const result = await generateCommit(armorDiff(1_000), config, {
      runner,
      commitStyle
    })
    const budget = availableContextTokens('haiku', estimateDiffTokens(commitStyle, config.charsPerToken))
    expect(result.chunkCount).toBeGreaterThan(1)
    for (const prompt of summaryPrompts) {
      expect(estimateDiffTokens(prompt, config.charsPerToken)).toBeLessThan(budget + 500)
    }
  })

  test('checks final evidence against the room remaining after the guide', async () => {
    const runner = vi.fn<Runner>(async () => ({
      text: 'summary '.repeat(5_000),
      costUsd: 0
    }))
    const config = {
      ...baseConfig,
      models: { ...baseConfig.models, final: 'haiku' }
    }
    await expect(
      generateCommit(textDiff, config, {
        runner,
        commitStyle: 'x'.repeat(159_000)
      })
    ).rejects.toThrow(/final prompt.*Shorten COMMITS.md/)
    expect(runner).toHaveBeenCalledOnce()
  })

  test('small text diff: one summary, one final call, one message', async () => {
    const { runner, summaryPrompts } = stubRunner()
    const result = await generateCommit(textDiff, baseConfig, { runner })
    expect(result.messages).toEqual(['fix: stubbed message'])
    expect(result.chunkCount).toBe(1)
    expect(result.summaries.length).toBe(1)
    expect(summaryPrompts[0]).toContain('old line')
    expect(result.costUsd).toBeCloseTo(0.003, 6)
  })

  test('armor-heavy diff is split by its dense token estimate', async () => {
    const { runner } = stubRunner()
    const config: Config = { ...baseConfig, maxChunkTokens: 40_000 }
    // ~1000 armor lines ≈ 71k chars ≈ 71k estimated tokens: needs >1 chunk
    // even though a chars/3.5 estimate (~20k) would call it a single chunk.
    const result = await generateCommit(armorDiff(1_000), config, { runner })
    expect(result.chunkCount).toBeGreaterThan(1)
    expect(result.summaries.length).toBe(result.chunkCount)
  })

  test("a backend 'prompt is too long' rejection re-splits and retries", async () => {
    let rejected = false
    const { runner, summaryPrompts } = stubRunner((_prompt, index) => {
      if (index === 0 && !rejected) {
        rejected = true
        throw promptTooLong()
      }
    })
    // Fits the estimate as one chunk, but the (simulated) backend disagrees.
    const config: Config = { ...baseConfig, maxChunkTokens: 100_000 }
    const result = await generateCommit(armorDiff(1_000), config, { runner })
    expect(rejected).toBe(true)
    expect(result.chunkCount).toBeGreaterThan(1)
    expect(result.messages).toEqual(['fix: stubbed message'])
    // All content still reached the model across the retried pieces.
    expect(summaryPrompts.join('').includes(armorLine(0).slice(1))).toBe(true)
  })

  test('other model errors propagate unchanged', async () => {
    const boom = new ClaudeCommitError('Rate limited by the Claude API.')
    const { runner } = stubRunner(() => {
      throw boom
    })
    await expect(generateCommit(textDiff, baseConfig, { runner })).rejects.toBe(boom)
  })

  test('gives up re-splitting below the retry floor', async () => {
    let calls = 0
    const { runner } = stubRunner(() => {
      calls++
      throw promptTooLong()
    })
    // Halving 15k lands below the 8k floor, so the first rejection surfaces.
    const config: Config = { ...baseConfig, maxChunkTokens: 15_000 }
    await expect(generateCommit(armorDiff(100), config, { runner })).rejects.toThrow(/prompt is too long/i)
    expect(calls).toBe(1)
  })

  test('summaries are tagged primary when no low-priority paths are configured', async () => {
    const { runner, summaryCalls } = stubRunner()
    const result = await generateCommit(`${textDiff}\n${skillDiff}`, baseConfig, { runner })
    expect(result.summaries.map((summary) => summary.priority)).toEqual(['primary'])
    expect(summaryCalls[0]?.prompt).toContain('old line')
    expect(summaryCalls[0]?.prompt).toContain('generated 2026-08-24')
    expect(summaryCalls[0]?.system).not.toMatch(LOW_PRIORITY_SYSTEM)
  })

  test('low-priority sections are summarised separately, after the primary ones, with their own prompt', async () => {
    const { runner, summaryCalls, finalPrompts } = stubRunner()
    const result = await generateCommit(`${skillDiff}\n${textDiff}`, lowPriorityConfig, { runner })

    expect(summaryCalls.length).toBe(2)
    const [primaryCall, lowCall] = summaryCalls as [SummaryCall, SummaryCall]
    // Primary first, even though the skill doc came first in the diff.
    expect(primaryCall.prompt).toContain('old line')
    expect(primaryCall.prompt).not.toContain('SKILL.md')
    expect(primaryCall.system).not.toMatch(LOW_PRIORITY_SYSTEM)
    expect(lowCall.prompt).toContain('SKILL.md')
    expect(lowCall.prompt).not.toContain('old line')
    expect(lowCall.prompt).toMatch(LOW_PRIORITY_SYSTEM)
    expect(lowCall.system).toMatch(LOW_PRIORITY_SYSTEM)

    expect(result.summaries.map((summary) => summary.priority)).toEqual(['primary', 'low'])
    expect(result.chunkCount).toBe(2)
    expect(finalPrompts[0]).toContain('Primary changes')
    expect(finalPrompts[0]).toContain('Low-priority changes')
  })

  test('a diff made only of low-priority paths is promoted and treated as primary', async () => {
    const { runner, summaryCalls, finalPrompts } = stubRunner()
    const result = await generateCommit(skillDiff, lowPriorityConfig, {
      runner
    })
    expect(summaryCalls.length).toBe(1)
    expect(summaryCalls[0]?.system).not.toMatch(LOW_PRIORITY_SYSTEM)
    expect(result.summaries.map((summary) => summary.priority)).toEqual(['primary'])
    expect(finalPrompts[0]).not.toContain('Low-priority changes')
  })

  test('progress labels distinguish the low-priority partition', async () => {
    const { runner } = stubRunner()
    const labels: string[] = []
    await generateCommit(`${textDiff}\n${skillDiff}`, lowPriorityConfig, {
      runner,
      progress: { onPhase: (label) => labels.push(label) }
    })
    expect(labels[0]).toBe('Reading diff')
    expect(labels[1]).toBe('Reading low-priority diff')
    expect(labels[2]).toMatch(/^Writing commit message/)
  })

  test('overflow retries re-split within the low-priority partition', async () => {
    let rejected = false
    const { runner, summaryCalls } = stubRunner((prompt, _index) => {
      if (!rejected && prompt.includes('secret.age')) {
        rejected = true
        throw promptTooLong()
      }
    })
    const config: Config = { ...lowPriorityConfig, maxChunkTokens: 100_000 }
    const result = await generateCommit(`${textDiff}\n${armorDiff(1_000)}`, config, { runner })
    expect(rejected).toBe(true)
    // One primary chunk, then several low-priority pieces after the retry.
    expect(result.summaries[0]?.priority).toBe('primary')
    const lowSummaries = result.summaries.slice(1)
    expect(lowSummaries.length).toBeGreaterThan(1)
    expect(lowSummaries.every((summary) => summary.priority === 'low')).toBe(true)
    expect(result.chunkCount).toBe(result.summaries.length)
    // Multi-part low-priority chunks are labelled as such.
    expect(
      summaryCalls.slice(1).every((call) => /part \d+ of \d+ of a larger low-priority diff/.test(call.prompt))
    ).toBe(true)
  })

  test('reports how many file sections matched the low-priority patterns', async () => {
    const { runner } = stubRunner()
    const mixed = await generateCommit(`${textDiff}\n${skillDiff}`, lowPriorityConfig, { runner })
    expect(mixed.lowPriority).toEqual({
      matchedFiles: 1,
      totalFiles: 2,
      promoted: false
    })

    const allLow = await generateCommit(skillDiff, lowPriorityConfig, {
      runner
    })
    expect(allLow.lowPriority).toEqual({
      matchedFiles: 1,
      totalFiles: 1,
      promoted: true
    })

    const none = await generateCommit(textDiff, baseConfig, { runner })
    expect(none.lowPriority).toEqual({
      matchedFiles: 0,
      totalFiles: 1,
      promoted: false
    })
  })

  test('skipArmored redaction applies before partitioning', async () => {
    const { runner, summaryCalls } = stubRunner()
    const config: Config = { ...lowPriorityConfig, skipArmored: true }
    await generateCommit(`${textDiff}\n${armorDiff(400)}`, config, {
      runner
    })
    expect(summaryCalls.length).toBe(2)
    expect(summaryCalls[1]?.system).toMatch(LOW_PRIORITY_SYSTEM)
    expect(summaryCalls[1]?.prompt).toContain('[cco: 400 armored/encoded lines omitted]')
    expect(summaryCalls[1]?.prompt).not.toContain('Ab9Xy')
  })

  test('skipArmored redacts ciphertext before it reaches the model', async () => {
    const { runner, summaryPrompts } = stubRunner()
    const config: Config = { ...baseConfig, skipArmored: true }
    const result = await generateCommit(armorDiff(400), config, { runner })
    expect(result.chunkCount).toBe(1)
    expect(summaryPrompts[0]).toContain('[cco: 400 armored/encoded lines omitted]')
    expect(summaryPrompts[0]).not.toContain('Ab9Xy')
    expect(summaryPrompts[0]).toContain('a/secret.age')
  })
})

describe('filenamesOnly', () => {
  const config: Config = { ...lowPriorityConfig, filenamesOnly: true }

  test('skips the summariser and sends only filenames to the final model', async () => {
    const calls: Array<{ prompt: string; model: string; system: string }> = []
    const phases: string[] = []
    const result = await generateCommit(
      `${skillDiff}\n${textDiff}`,
      {
        ...config,
        models: {
          commits: null,
          summary: 'summary-model',
          final: 'final-model'
        },
        maxChunkTokens: 1
      },
      {
        runner: async (prompt, options) => {
          calls.push({ prompt, model: options.model, system: options.system })
          return {
            text: '',
            costUsd: 0.012,
            structured: { messages: ['Update files'] }
          }
        },
        progress: { onPhase: (phase) => phases.push(phase) }
      }
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.model).toBe('final-model')
    expect(calls[0]?.prompt).toContain('"a.txt"')
    expect(calls[0]?.prompt).toContain('".agents/skills/ora-skilld/SKILL.md"')
    expect(calls[0]?.prompt).toContain('Low-priority changes')
    expect(calls[0]?.prompt).not.toMatch(/old line|new line|generated 2026|diff --git|@@|summary of/)
    expect(calls[0]?.system).toContain('only the filenames')
    expect(result.messages).toEqual(['Update files'])
    expect(result.chunkCount).toBe(0)
    expect(result.summaries).toEqual([])
    expect(result.costUsd).toBe(0.012)
    expect(phases).toEqual(['Writing commit message'])
    expect(result.lowPriority).toEqual({
      matchedFiles: 1,
      totalFiles: 2,
      promoted: false
    })
  })

  test('ignore removes filenames and fully ignored changes fail before a call', async () => {
    const { runner, finalPrompts, summaryPrompts } = stubRunner()
    const ignoredConfig = { ...config, ignore: ['.agents/**'] }
    const result = await generateCommit(`${textDiff}\n${skillDiff}`, ignoredConfig, { runner })
    expect(finalPrompts[0]).toContain('"a.txt"')
    expect(finalPrompts[0]).not.toContain('SKILL.md')
    expect(result.ignored).toEqual({ ignoredFiles: 1, totalFiles: 2 })
    await expect(generateCommit(skillDiff, ignoredConfig, { runner })).rejects.toThrow(/"ignore" pattern/)
    expect(finalPrompts).toHaveLength(1)
    expect(summaryPrompts).toEqual([])
  })

  test('all-low-priority filenames are promoted', async () => {
    const { runner, finalPrompts } = stubRunner()
    const result = await generateCommit(skillDiff, config, { runner })
    expect(result.lowPriority.promoted).toBe(true)
    expect(finalPrompts[0]).toContain('SKILL.md')
    expect(finalPrompts[0]).not.toContain('Low-priority changes')
  })

  test('armoured content is never sent, regardless of skipArmored', async () => {
    for (const skipArmored of [false, true]) {
      const { runner, finalPrompts, summaryPrompts } = stubRunner()
      await generateCommit(armorDiff(400), { ...config, skipArmored }, { runner })
      expect(summaryPrompts).toEqual([])
      expect(finalPrompts[0]).toContain('"secret.age"')
      expect(finalPrompts[0]).not.toMatch(/Ab9Xy|omitted|@@/)
    }
  })

  test('interactive fallbacks keep filename input and call only the final model', async () => {
    const prompts: string[] = []
    const structured: boolean[] = []
    const abortController = new AbortController()
    const streamed: string[] = []
    const result = await generateCommit(
      textDiff,
      {
        ...config,
        models: {
          commits: null,
          summary: 'summary-model',
          final: 'final-model'
        }
      },
      {
        count: 2,
        abortController,
        progress: { onText: (text) => streamed.push(text) },
        runner: async (prompt, options) => {
          prompts.push(prompt)
          structured.push(options.outputFormat !== undefined)
          expect(options.model).toBe('final-model')
          expect(options.abortController).toBe(abortController)
          expect(options.allowApiKey).toBe(false)
          if (options.outputFormat) return { text: 'invalid JSON', costUsd: 0.001 }
          options.onText?.('Update files')
          return {
            text: '===OPTION===\nUpdate files\n===OPTION===\nRefresh files',
            costUsd: 0.002
          }
        }
      }
    )
    expect(structured).toEqual([true, false])
    expect(prompts).toHaveLength(2)
    for (const prompt of prompts) {
      expect(prompt).toContain('"a.txt"')
      expect(prompt).toContain('exactly 2 distinct')
      expect(prompt).not.toMatch(/old line|new line|diff --git|@@/)
    }
    expect(result.messages).toEqual(['Update files', 'Refresh files'])
    expect(result.costUsd).toBeCloseTo(0.003)
    expect(result.chunkCount).toBe(0)
    expect(streamed).toEqual(['Update files'])
  })

  test.each(['', ' \n', 'unrecognisable input'])('rejects input without filenames: %p', async (diff) => {
    const { runner, finalPrompts, summaryPrompts } = stubRunner()
    await expect(generateCommit(diff, config, { runner })).rejects.toThrow(/no staged/i)
    expect(finalPrompts).toEqual([])
    expect(summaryPrompts).toEqual([])
  })
})

describe('ignore', () => {
  const codeFile = [
    'diff --git a/src/app.ts b/src/app.ts',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1 +1 @@',
    '-const a = 1;',
    '+const a = 2;'
  ].join('\n')

  const vendorFile = [
    'diff --git a/vendor/big.js b/vendor/big.js',
    '--- a/vendor/big.js',
    '+++ b/vendor/big.js',
    '@@ -1 +1 @@',
    '-old',
    '+new'
  ].join('\n')

  /** A runner that records every prompt it was handed. */
  function recordingRunner(prompts: string[]): Runner {
    return (async (prompt: string) => {
      prompts.push(prompt)
      return { text: 'A summary', costUsd: 0 } satisfies ModelResult
    }) as Runner
  }

  test('never sends ignored content to any model', async () => {
    const prompts: string[] = []
    await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: ['vendor/**'] },
      { runner: recordingRunner(prompts) }
    )
    expect(prompts.some((p) => p.includes('vendor/big.js'))).toBe(false)
    expect(prompts.some((p) => p.includes('src/app.ts'))).toBe(true)
  })

  test('reports what it dropped', async () => {
    const result = await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: ['vendor/**'] },
      { runner: recordingRunner([]) }
    )
    expect(result.ignored).toEqual({ ignoredFiles: 1, totalFiles: 2 })
  })

  test('reports zero when the patterns matched nothing', async () => {
    const result = await generateCommit(
      codeFile,
      { ...baseConfig, ignore: ['node_modules/**'] },
      { runner: recordingRunner([]) }
    )
    expect(result.ignored).toEqual({ ignoredFiles: 0, totalFiles: 1 })
  })

  test('stops rather than describing a commit it was told not to read', async () => {
    const prompts: string[] = []
    const promise = generateCommit(
      vendorFile,
      { ...baseConfig, ignore: ['vendor/**'] },
      { runner: recordingRunner(prompts) }
    )
    await expect(promise).rejects.toThrow(ClaudeCommitError)
    await expect(promise).rejects.toThrow(/"ignore" pattern/)
    // And it stopped before spending anything.
    expect(prompts).toEqual([])
  })

  test('the fully-ignored error points at the way out', async () => {
    const error = await generateCommit(
      vendorFile,
      { ...baseConfig, ignore: ['vendor/**'] },
      { runner: recordingRunner([]) }
    ).catch((e) => e)
    expect(error.message).toMatch(/--no-ignore/)
  })

  test('runs ahead of the low-priority partition', async () => {
    const prompts: string[] = []
    // vendor/ is ignored outright; app.ts is all that is left, so there is
    // no low-priority group and the primary prompt is the only one.
    const result = await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: ['vendor/**'], lowPriorityPaths: ['vendor/**'] },
      { runner: recordingRunner(prompts) }
    )
    expect(result.lowPriority.matchedFiles).toBe(0)
    expect(result.summaries.every((s) => s.priority === 'primary')).toBe(true)
  })

  test('an empty pattern list changes nothing', async () => {
    const result = await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: [] },
      { runner: recordingRunner([]) }
    )
    expect(result.ignored.ignoredFiles).toBe(0)
  })
})

describe('chunk sizing', () => {
  test("sizes summary chunks against the summary model's window", async () => {
    const runner = (async () => ({ text: 'A summary', costUsd: 0 }) satisfies ModelResult) as Runner

    // ~740k characters of ordinary diff: one chunk at Sonnet's 1M window,
    // more than one at Haiku's 200k.
    const big = armorFreeDiff(12_000)
    const sonnetRun = await generateCommit(big, baseConfig, { runner })
    const haikuRun = await generateCommit(
      big,
      {
        ...baseConfig,
        models: { commits: null, summary: 'haiku', final: 'sonnet' }
      },
      { runner }
    )
    expect(sonnetRun.chunkCount).toBe(1)
    expect(haikuRun.chunkCount).toBeGreaterThan(1)
  })
})

/** A plain (non-armored) diff of roughly `lines` changed lines. */
function armorFreeDiff(lines: number): string {
  const body = Array.from({ length: lines }, (_, i) => `+  const value${i} = compute(${i}); // a line of ordinary code`)
  return [
    'diff --git a/src/big.ts b/src/big.ts',
    '--- a/src/big.ts',
    '+++ b/src/big.ts',
    `@@ -1 +1,${lines} @@`,
    ...body
  ].join('\n')
}

describe('TypeSafe candidate check', () => {
  const candidates = ['fix(a): first option', 'fix(a): second option', 'fix(a): third option']
  const typesafeConfig: Config = {
    ...baseConfig,
    typesafe: { ...baseConfig.typesafe, enable: true }
  }
  const env = { TYPESAFE_API_KEY: 'ts-key' }

  /** A runner whose final stage returns three candidates, counting every call. */
  function threeOptionRunner() {
    const calls: string[] = []
    const runner: Runner = async (prompt, opts): Promise<ModelResult> => {
      calls.push(prompt)
      if (opts.outputFormat)
        return {
          text: '',
          costUsd: 0.001,
          structured: { messages: candidates }
        }
      return {
        text: 'Summary: a.txt replaces old line with new line.',
        costUsd: 0.002
      }
    }
    return { runner, calls }
  }

  test('flags, reorders and reports the candidates when enabled', async () => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch({ c0_subject_shown: 0.05 })
    const result = await generateCommit(textDiff, typesafeConfig, {
      runner,
      count: 3,
      env,
      typesafeFetch: fetch
    })

    expect(result.messages).toEqual([candidates[1], candidates[2], candidates[0]])
    expect(result.warnings).toEqual([[], [], ['subject names a change the summaries do not show']])
    expect(result.candidateCheck).toEqual({
      status: 'checked',
      model: 'jev-1.13.0',
      inputTokens: 1500,
      droppedDuplicates: 0,
      mixedCommit: false
    })
    expect(requests).toHaveLength(1)
    expect(JSON.stringify(requests[0]?.body.state)).toContain('a.txt replaces old line')
  })

  test('reports a null token count when the API does not report usage', async () => {
    const { runner } = threeOptionRunner()
    const { fetch } = fakeJevFetch((body) => ({
      status: 200,
      json: {
        model: 'jev-1.13.0',
        answers: jevAnswers(body.questions),
        usage: { input_tokens: null, output_tokens: 0 }
      }
    }))
    const result = await generateCommit(textDiff, typesafeConfig, {
      runner,
      count: 3,
      env,
      typesafeFetch: fetch
    })

    expect(result.messages).toEqual(candidates)
    expect(result.candidateCheck).toEqual({
      status: 'checked',
      model: 'jev-1.13.0',
      inputTokens: null,
      droppedDuplicates: 0,
      mixedCommit: false
    })
  })

  test.each([null, 'Use repository conventions.'])(
    'a missing key fails before any model is called (style=%s)',
    async (commitStyle) => {
      const { runner, calls } = threeOptionRunner()
      await expect(
        generateCommit(textDiff, typesafeConfig, {
          runner,
          count: 3,
          env: {},
          commitStyle
        })
      ).rejects.toThrow(/TYPESAFE_API_KEY/)
      expect(calls).toHaveLength(0)
    }
  )

  test('reads the key from the variable "typesafe.env" names', async () => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch()
    const config: Config = {
      ...typesafeConfig,
      typesafe: { ...typesafeConfig.typesafe, env: '__TYPESAFE_API_KEY' }
    }
    await generateCommit(textDiff, config, {
      runner,
      count: 3,
      env: { __TYPESAFE_API_KEY: 'alt' },
      typesafeFetch: fetch
    })
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer alt')
  })

  test.each([null, 'Use repository conventions.'])(
    'a failed check keeps the model order and says why (style=%s)',
    async (commitStyle) => {
      const { runner } = threeOptionRunner()
      const { fetch } = fakeJevFetch(() => ({
        status: 401,
        json: { error: 'invalid key' }
      }))
      const result = await generateCommit(textDiff, typesafeConfig, {
        runner,
        count: 3,
        env,
        typesafeFetch: fetch,
        commitStyle
      })

      expect(result.messages).toEqual(candidates)
      expect(result.warnings).toEqual([[], [], []])
      expect(result.candidateCheck?.status).toBe('failed')
    }
  )

  test('checks a single non-interactive message too', async () => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch()
    const single = await generateCommit(textDiff, typesafeConfig, {
      runner,
      count: 1,
      env,
      typesafeFetch: fetch
    })

    expect(requests).toHaveLength(1)
    expect(single.candidateCheck?.status).toBe('checked')
  })

  test('a missing key fails a single-message run before any model is called', async () => {
    const { runner, calls } = threeOptionRunner()
    await expect(generateCommit(textDiff, typesafeConfig, { runner, count: 1, env: {} })).rejects.toThrow(
      /TYPESAFE_API_KEY/
    )
    expect(calls).toHaveLength(0)
  })

  test.each([null, 'Use repository conventions.'])('does not run when disabled (style=%s)', async (commitStyle) => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch()
    const disabled = await generateCommit(textDiff, baseConfig, {
      runner,
      count: 3,
      env: {},
      typesafeFetch: fetch,
      commitStyle
    })

    expect(requests).toHaveLength(0)
    expect(disabled.candidateCheck).toBeNull()
    expect(disabled.messages).toEqual(candidates)
  })

  test('reports staged changes that look like more than one commit', async () => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch({ mixed_commit: 0.7 })
    const result = await generateCommit(textDiff, typesafeConfig, {
      runner,
      count: 1,
      env,
      typesafeFetch: fetch
    })

    expect(requests[0]?.body.questions.mixed_commit?.type).toBe('noul')
    expect(result.candidateCheck).toMatchObject({
      status: 'checked',
      mixedCommit: true
    })
    expect(describeCheckNotices(result.candidateCheck)).toEqual([
      'These staged changes look like more than one commit. Consider splitting them.'
    ])
  })

  test('sends the custom instructions and flags a candidate that ignores them', async () => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch({ c1_follows_custom: 0.05 })
    const config: Config = {
      ...typesafeConfig,
      customPrompt: 'Mention the ticket.'
    }
    const result = await generateCommit(textDiff, config, {
      runner,
      count: 3,
      env,
      typesafeFetch: fetch
    })

    expect(requests[0]?.body.state.custom_instructions).toBe('Mention the ticket.')
    expect(result.messages.at(-1)).toBe(candidates[1])
    expect(result.warnings.at(-1)).toEqual(['ignores your custom instructions'])
  })

  test.each([
    [1, false],
    [3, false],
    [1, true],
    [3, true]
  ] as const)('checks active style in the same request (count=%s, filenamesOnly=%s)', async (count, filenamesOnly) => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch({ c0_follows_style: 0.05 })
    const config: Config = {
      ...typesafeConfig,
      filenamesOnly,
      conventionalCommits: false,
      gitmoji: null,
      multiline: true,
      template: '[PROJ] {message}',
      customPrompt: 'Mention the ticket.'
    }
    const result = await generateCommit(textDiff, config, {
      runner,
      count,
      env,
      typesafeFetch: fetch,
      commitStyle: 'Use past tense and no body.'
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.body.state.repository_style).toBe('Use past tense and no body.')
    expect(requests[0]?.body.state.style_overrides).toEqual({
      conventionalCommits: false,
      gitmoji: null,
      multiline: true,
      template: '[PROJ] {message}'
    })
    expect(requests[0]?.body.state.custom_instructions).toBe('Mention the ticket.')
    expect(result.candidateCheck?.status).toBe('checked')
    expect(result.warnings.some((warnings) => warnings.includes('ignores COMMITS.md instructions'))).toBe(true)
  })

  test('a missing style answer reports a failed check, never a pass', async () => {
    const { runner } = threeOptionRunner()
    const { fetch } = fakeJevFetch((body) => {
      const answers = jevAnswers(body.questions)
      delete answers.c0_follows_style
      return { status: 200, json: { model: 'jev-1.13.0', answers } }
    })
    const result = await generateCommit(textDiff, typesafeConfig, {
      runner,
      count: 3,
      env,
      typesafeFetch: fetch,
      commitStyle: 'Use past tense.'
    })
    expect(result.candidateCheck).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('c0_follows_style')
    })
    expect(result.messages).toEqual(candidates)
    expect(result.warnings).toEqual([[], [], []])
  })

  test('checks filenames-only candidates against the file list', async () => {
    const { runner } = threeOptionRunner()
    const { fetch, requests } = answeringJevFetch()
    await generateCommit(
      textDiff,
      { ...typesafeConfig, filenamesOnly: true },
      { runner, count: 3, env, typesafeFetch: fetch }
    )

    const state = requests[0]?.body.state as {
      context: string
      evidence: { primary: string }
    }
    expect(state.context).toMatch(/paths of the changed files/)
    expect(state.evidence.primary).toBe('a.txt')
  })
})

describe('gitmoji format check', () => {
  const clashing = ['🔧 feat(config): change a default', '✨ feat(config): change a default']
  const runner: Runner = async (_prompt, opts): Promise<ModelResult> =>
    opts.outputFormat
      ? { text: '', costUsd: 0, structured: { messages: clashing } }
      : { text: 'Summary: a default changed.', costUsd: 0 }

  const singleRunner: Runner = async (_prompt, opts): Promise<ModelResult> =>
    opts.outputFormat
      ? { text: '', costUsd: 0, structured: { messages: [clashing[0]] } }
      : { text: 'Summary: a default changed.', costUsd: 0 }
  const formats = { gitmoji: true, conventionalCommits: true }
  const enabled = { ...baseConfig.typesafe, enable: true }
  const env = { TYPESAFE_API_KEY: 'ts-key' }

  test('checks actual emoji/type pairs when an active guide owns both settings', async () => {
    const { fetch } = answeringJevFetch()
    const result = await generateCommit(
      textDiff,
      { ...baseConfig, typesafe: enabled },
      {
        runner,
        count: 2,
        env,
        typesafeFetch: fetch,
        commitStyle: 'Use gitmoji Conventional Commits.'
      }
    )
    expect(result.messages).toEqual([clashing[1], clashing[0]])
    expect(result.warnings).toEqual([[], ['gitmoji does not match the commit type']])
  })

  test.each([
    { gitmoji: false, conventionalCommits: null },
    { gitmoji: null, conventionalCommits: false }
  ])('explicit false disables style-owned format checking: %j', async (format) => {
    const { fetch } = answeringJevFetch()
    const result = await generateCommit(
      textDiff,
      { ...baseConfig, ...format, typesafe: enabled },
      {
        runner: singleRunner,
        env,
        typesafeFetch: fetch,
        commitStyle: 'Use repository conventions.'
      }
    )
    expect(result.warnings).toEqual([[]])
  })

  test.each(['🔧 Update defaults', 'feat: change defaults', 'Update defaults'])(
    'style-owned format checking ignores candidates without both components: %s',
    async (message) => {
      const { fetch } = answeringJevFetch()
      const result = await generateCommit(
        textDiff,
        { ...baseConfig, typesafe: enabled },
        {
          runner: async () => ({
            text: '',
            costUsd: 0,
            structured: { messages: [message] }
          }),
          env,
          typesafeFetch: fetch,
          commitStyle: 'Use repository conventions.'
        }
      )
      expect(result.warnings).toEqual([[]])
    }
  )

  test('with TypeSafe off, a clash changes nothing', async () => {
    const result = await generateCommit(textDiff, { ...baseConfig, ...formats }, { runner, count: 2 })
    expect(result.messages).toEqual(clashing)
    expect(result.warnings).toEqual([[], []])
  })

  test('with TypeSafe on, flags a clash and moves it last', async () => {
    const { fetch } = answeringJevFetch()
    const config: Config = { ...baseConfig, ...formats, typesafe: enabled }
    const result = await generateCommit(textDiff, config, {
      runner,
      count: 2,
      env,
      typesafeFetch: fetch
    })
    expect(result.messages).toEqual([clashing[1], clashing[0]])
    expect(result.warnings).toEqual([[], ['gitmoji does not match the commit type']])
  })

  test('with TypeSafe on, flags a single message', async () => {
    const { fetch } = answeringJevFetch()
    const config: Config = { ...baseConfig, ...formats, typesafe: enabled }
    const result = await generateCommit(textDiff, config, {
      runner: singleRunner,
      count: 1,
      env,
      typesafeFetch: fetch
    })
    expect(result.warnings).toEqual([['gitmoji does not match the commit type']])
  })

  test('stays quiet unless both gitmoji and conventional commits are on', async () => {
    const config: Config = { ...baseConfig, gitmoji: true, typesafe: enabled }
    const { fetch } = answeringJevFetch()
    const result = await generateCommit(textDiff, config, {
      runner: singleRunner,
      count: 1,
      env,
      typesafeFetch: fetch
    })
    expect(result.warnings).toEqual([[]])
  })
})

describe('describeCheckNotices', () => {
  test('says nothing when the check passed or did not run', () => {
    expect(describeCheckNotices(null)).toEqual([])
    expect(
      describeCheckNotices({
        status: 'checked',
        model: 'jev',
        inputTokens: 1,
        droppedDuplicates: 0,
        mixedCommit: false
      })
    ).toEqual([])
  })

  test('names the error when the check failed', () => {
    expect(describeCheckNotices({ status: 'failed', error: '401 bad key' })).toEqual([
      'TypeSafe check failed (401 bad key); nothing was flagged or reordered.'
    ])
  })
})
