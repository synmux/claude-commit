import { describe, expect, test } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config.ts'
import { ClaudeCommitError } from '../src/errors.ts'
import {
  buildCandidateRequest,
  type CandidateEvidence,
  checkCandidates,
  orderFlaggedLast,
  rankCandidates,
  resolveTypeSafeKey
} from '../src/typesafe.ts'
import { answeringJevFetch, fakeJevFetch, jevAnswers } from './typesafe-fixtures.ts'

const settings = DEFAULT_CONFIG.typesafe

const summaries: CandidateEvidence = {
  kind: 'summaries',
  primary: 'src/generate.ts: retry the final stage without structured output.',
  lowPriority: null
}

const split: CandidateEvidence = {
  ...summaries,
  lowPriority: 'pnpm-lock.yaml regenerated.'
}

const messages = [
  'fix(generate): retry without structured output\n\n- Retry once without it.',
  'chore(deps): bump vitest',
  'fix(generate): fall back when structured output is rejected'
]

/** Answers for the request {@link buildCandidateRequest} builds, with overrides by question name. */
const answersFor = (request: ReturnType<typeof buildCandidateRequest>, overrides: Record<string, number> = {}) =>
  jevAnswers(request.questions, overrides)

describe('resolveTypeSafeKey', () => {
  test('reads the default variable', () => {
    expect(resolveTypeSafeKey(settings, { TYPESAFE_API_KEY: 'ts-key' })).toBe('ts-key')
  })

  test('reads an alternate variable named by "env"', () => {
    const env = { TYPESAFE_API_KEY: 'wrong', __TYPESAFE_API_KEY: 'right' }
    expect(resolveTypeSafeKey({ ...settings, env: '__TYPESAFE_API_KEY' }, env)).toBe('right')
  })

  test('a missing or blank key is an error that names the variable', () => {
    for (const env of [{}, { TYPESAFE_API_KEY: '   ' }]) {
      expect(() => resolveTypeSafeKey(settings, env)).toThrow(ClaudeCommitError)
      expect(() => resolveTypeSafeKey(settings, env)).toThrow(/TYPESAFE_API_KEY/)
    }
  })
})

describe('buildCandidateRequest', () => {
  test('asks the support questions once per candidate', () => {
    const request = buildCandidateRequest(messages, summaries)
    for (const index of [0, 1, 2]) {
      expect(request.questions[`c${index}_subject_shown`]?.type).toBe('noul')
      expect(request.questions[`c${index}_edits_shown`]?.type).toBe('noul')
      expect(JSON.stringify(request.questions[`c${index}_subject_shown`])).toContain(`candidates[${index}]`)
    }
  })

  test('asks about the primary changes only when there are low-priority changes', () => {
    expect(buildCandidateRequest(messages, summaries).questions.c0_subject_primary).toBeUndefined()
    expect(buildCandidateRequest(messages, split).questions.c0_subject_primary?.type).toBe('noul')
  })

  test('asks one near-duplicate question per pair', () => {
    const names = Object.keys(buildCandidateRequest(messages, summaries).questions)
    expect(names.filter((name) => name.startsWith('dup_')).sort()).toEqual(['dup_0_1', 'dup_0_2', 'dup_1_2'])
  })

  test('splits each candidate into subject and body', () => {
    const { state } = buildCandidateRequest(messages, summaries)
    expect(state.candidates[0]).toEqual({
      subject: 'fix(generate): retry without structured output',
      body: '- Retry once without it.'
    })
    expect(state.candidates[1]).toEqual({
      subject: 'chore(deps): bump vitest',
      body: ''
    })
  })

  test('labels file-list evidence so it is not read as summaries', () => {
    const { state } = buildCandidateRequest(messages, {
      kind: 'filenames',
      primary: '- "src/a.ts"',
      lowPriority: null
    })
    expect(state.context).toMatch(/paths/)
    expect(state.evidence).toEqual({ primary: '- "src/a.ts"' })
  })
})

describe('rankCandidates', () => {
  test('keeps model order when every candidate passes', () => {
    const request = buildCandidateRequest(messages, summaries)
    const ranked = rankCandidates(messages, summaries, answersFor(request))
    expect(ranked.messages).toEqual(messages)
    expect(ranked.warnings).toEqual([[], [], []])
    expect(ranked.droppedDuplicates).toBe(0)
  })

  test('puts flagged candidates last and says why', () => {
    const request = buildCandidateRequest(messages, split)
    const ranked = rankCandidates(messages, split, answersFor(request, { c0_subject_primary: 0.05 }))
    expect(ranked.messages).toEqual([messages[1], messages[2], messages[0]])
    expect(ranked.warnings[2]).toEqual(['subject is about the low-priority changes'])
  })

  test('flags claims the evidence does not show', () => {
    const request = buildCandidateRequest(messages, summaries)
    const ranked = rankCandidates(
      messages,
      summaries,
      answersFor(request, { c1_subject_shown: 0.1, c1_edits_shown: 0.1 })
    )
    expect(ranked.messages.at(-1)).toBe(messages[1])
    expect(ranked.warnings.at(-1)).toEqual([
      'subject names a change the summaries do not show',
      'describes an edit the summaries do not show'
    ])
  })

  test('is stricter about claimed edits than about the subject', () => {
    // Tuned separately: 0.45 sits between real options (0.62 and up) and
    // invented edits (0.34 and down), but well above mismatched subjects.
    const request = buildCandidateRequest(messages, summaries)
    const ranked = rankCandidates(
      messages,
      summaries,
      answersFor(request, { c0_subject_shown: 0.4, c1_edits_shown: 0.4 })
    )
    expect(ranked.warnings[ranked.messages.indexOf(messages[0] ?? '')]).toEqual([])
    expect(ranked.warnings[ranked.messages.indexOf(messages[1] ?? '')]).toEqual([
      'describes an edit the summaries do not show'
    ])
  })

  test('drops the later candidate of a near-duplicate pair', () => {
    const request = buildCandidateRequest(messages, summaries)
    const ranked = rankCandidates(messages, summaries, answersFor(request, { dup_0_2: 0.9 }))
    expect(ranked.messages).toEqual([messages[0], messages[1]])
    expect(ranked.droppedDuplicates).toBe(1)
  })

  test('keeps the unflagged one of a near-duplicate pair', () => {
    const request = buildCandidateRequest(messages, summaries)
    const ranked = rankCandidates(messages, summaries, answersFor(request, { dup_0_2: 0.9, c0_subject_shown: 0.05 }))
    expect(ranked.messages).toEqual([messages[1], messages[2]])
  })

  test('a missing answer is an error, not a pass', () => {
    const request = buildCandidateRequest(messages, summaries)
    const answers = answersFor(request)
    delete answers.c1_edits_shown
    expect(() => rankCandidates(messages, summaries, answers)).toThrow(/c1_edits_shown/)
  })
})

describe('custom instructions', () => {
  const rules = { customPrompt: "End the message with 'Refs: #123'." }

  test('asks one question per candidate and sends the instructions as state', () => {
    const request = buildCandidateRequest(messages, summaries, rules)
    expect(request.questions.c0_follows_custom?.type).toBe('noul')
    expect(request.questions.c2_follows_custom?.type).toBe('noul')
    expect(request.state.custom_instructions).toBe(rules.customPrompt)
  })

  test('asks nothing about them when no customPrompt is set', () => {
    const request = buildCandidateRequest(messages, summaries)
    expect(request.questions.c0_follows_custom).toBeUndefined()
    expect(request.state.custom_instructions).toBeUndefined()
  })

  test('flags a candidate that ignores them', () => {
    const request = buildCandidateRequest(messages, summaries, rules)
    const ranked = rankCandidates(messages, summaries, answersFor(request, { c0_follows_custom: 0.1 }), rules)
    expect(ranked.messages).toEqual([messages[1], messages[2], messages[0]])
    expect(ranked.warnings[2]).toEqual(['ignores your custom instructions'])
  })
})

describe('prior warnings', () => {
  test('count as flags and come before the warnings Jev adds', () => {
    const request = buildCandidateRequest(messages, summaries)
    const ranked = rankCandidates(messages, summaries, answersFor(request, { c1_edits_shown: 0.1 }), undefined, [
      [],
      ['gitmoji does not match the commit type'],
      []
    ])
    expect(ranked.messages).toEqual([messages[0], messages[2], messages[1]])
    expect(ranked.warnings[2]).toEqual([
      'gitmoji does not match the commit type',
      'describes an edit the summaries do not show'
    ])
  })

  test('orderFlaggedLast keeps each group in model order', () => {
    const ordered = orderFlaggedLast(['a', 'b', 'c', 'd'], [['x'], [], ['y'], []])
    expect(ordered.messages).toEqual(['b', 'd', 'a', 'c'])
    expect(ordered.warnings).toEqual([[], [], ['x'], ['y']])
  })

  test('orderFlaggedLast keeps identical messages apart', () => {
    expect(orderFlaggedLast(['same', 'same'], [['x'], []]).warnings).toEqual([[], ['x']])
  })
})

describe('mixed commits', () => {
  test('asks once, about the summaries only', () => {
    expect(buildCandidateRequest(messages, summaries).questions.mixed_commit?.type).toBe('noul')
    const files = {
      kind: 'filenames' as const,
      primary: 'a.ts',
      lowPriority: null
    }
    expect(buildCandidateRequest(messages, files).questions.mixed_commit).toBeUndefined()
  })

  test('reports a mixed commit from 0.6 up', () => {
    const request = buildCandidateRequest(messages, summaries)
    expect(rankCandidates(messages, summaries, answersFor(request, { mixed_commit: 0.6 })).mixedCommit).toBe(true)
    expect(rankCandidates(messages, summaries, answersFor(request, { mixed_commit: 0.41 })).mixedCommit).toBe(false)
  })

  test('is never reported for file-list evidence', () => {
    const files = {
      kind: 'filenames' as const,
      primary: 'a.ts',
      lowPriority: null
    }
    const request = buildCandidateRequest(messages, files)
    expect(rankCandidates(messages, files, answersFor(request)).mixedCommit).toBe(false)
  })
})

describe('checkCandidates', () => {
  test('sends one request through the SDK and returns the ranked candidates', async () => {
    const { fetch, requests } = answeringJevFetch({ c0_subject_shown: 0.1 })
    const checked = await checkCandidates(messages, summaries, {
      apiKey: 'ts-key',
      settings,
      fetch
    })

    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request?.url).toMatch(/\/v1\/systemone$/)
    expect(request?.headers.get('authorization')).toBe('Bearer ts-key')
    expect(request?.body.model).toBe('jev-1.13.0')
    expect(checked.messages.at(-1)).toBe(messages[0])
    expect(checked.inputTokens).toBe(1500)
    expect(checked.model).toBe('jev-1.13.0')
  })

  test('an API failure rejects rather than passing every candidate', async () => {
    const { fetch } = fakeJevFetch(() => ({
      status: 401,
      json: { error: 'bad key' }
    }))
    await expect(checkCandidates(messages, summaries, { apiKey: 'bad', settings, fetch })).rejects.toThrow()
  })
})
