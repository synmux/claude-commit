/**
 * The TypeSafe candidate check: after the final model writes several
 * candidate messages, one request to TypeSafe's Jev model judges each of
 * them against the evidence it was written from. The picker keeps the
 * model's order but moves doubtful candidates last, with a warning, and
 * drops near-duplicates.
 *
 *   candidates + evidence ──Jev──▶ yes/no answers ──code──▶ flagged, deduplicated
 *
 * Jev returns typed judgments, not text, so this module does not go through
 * `runPrompt`. Every action - the order, the warnings, which near-duplicate
 * to drop - is decided here in code from named thresholds. The thresholds were
 * tuned on 200 real options for 20 commits of this repository; see
 * `docs/superpowers/specs/2026-10-19-typesafe-candidate-check-design.md`.
 */
import { type Fetch, type Questions, TypeSafeClient } from '@typesafe-ai/sdk'
import { ClaudeCommitError } from './errors.ts'
import type { TypeSafeConfig } from './types.ts'

/**
 * A `subject_shown` answer below this flags the candidate. Tuned on 200 real
 * opus options for 20 commits: real options scored 0.42 at the lowest,
 * subjects taken from another commit 0.06 at the highest.
 */
const SUBJECT_NOT_SHOWN_BELOW = 0.2

/**
 * An `edits_shown` answer below this flags the candidate. Real options
 * scored 0.62 at the lowest; options with a bullet spliced in from another
 * commit scored 0.34 at the highest. At 0.2, 3 of 20 of those slipped through.
 */
const EDITS_NOT_SHOWN_BELOW = 0.45

/**
 * A "subject describes the primary changes" answer below this flags the
 * candidate. Real options on split commits scored 0.82 at the lowest. No
 * churn-led control was tested, so this keeps the conservative 0.2.
 */
const NOT_PRIMARY_BELOW = 0.2

/**
 * A near-duplicate answer at or above this drops the lower-ranked candidate.
 * In practice this removes near-verbatim rewrites only: paraphrases scored
 * 0.89 or more, but reworded real options that a person would call
 * duplicates scored 0.75 to 0.86, overlapping options that differ. Lowering
 * it would drop real alternatives, so it stays high.
 */
const DUPLICATE_FROM = 0.85

/**
 * A "follows the custom instructions" answer below this flags the
 * candidate. Tested with 6 instructions on 6 commits: options written with
 * the instruction scored 0.25 at the lowest (0 of 108 flagged). Options
 * written without it were caught for 18 of 18 missing a required trailer,
 * 10 of 11 using a banned word, 10 of 10 missing a test mention, and 9 of
 * 18 in the wrong tense. Instructions that depend on facts Jev never sees,
 * such as the branch name, were never flagged.
 */
const FOLLOWS_CUSTOM_BELOW = 0.2

/**
 * A "describes unrelated changes" answer at or above this marks the commit
 * as mixed. On 37 clean and 37 synthetic mixed summaries (two commits
 * joined), 0.6 caught 32 mixed and 4 of 5 commits that were really mixed,
 * and warned on none of 33 truly clean ones (highest 0.41).
 */
const MIXED_FROM = 0.6

/** Retries after a failed attempt. The user is waiting at the picker, so keep it short. */
const RETRIES = 1

/** What the candidates were written from. */
export interface CandidateEvidence {
  /** Model-written diff summaries, or bare file paths in filenamesOnly mode. */
  kind: 'summaries' | 'filenames'
  /** Evidence for the primary changes. */
  primary: string
  /** Evidence for the low-priority changes, or `null` when the change has one priority group. */
  lowPriority: string | null
}

/** What the user asked of every message, beyond the evidence. */
export interface CandidateRules {
  /** The configured `customPrompt`, judged per candidate when set. */
  customPrompt: string | null
}

const NO_RULES: CandidateRules = { customPrompt: null }

/** The state sent to Jev. A type alias so it satisfies the SDK's JSON state type. */
export type CandidateState = {
  context: string
  evidence: { primary: string; low_priority?: string }
  candidates: Array<{ subject: string; body: string }>
  custom_instructions?: string
}

/** Candidates in the order to show them, with near-duplicates removed. */
export interface RankedCandidates {
  messages: string[]
  /** Why each candidate is doubtful, aligned with `messages`; empty when it passed. */
  warnings: string[][]
  /** How many candidates were dropped as near-duplicates of a better one. */
  droppedDuplicates: number
  /** The primary changes look like more than one commit. Always false for file-list evidence. */
  mixedCommit: boolean
}

/** The ranked candidates plus what the request cost. */
export interface CheckedCandidates extends RankedCandidates {
  inputTokens: number
  /** The model that answered, as reported by the API. */
  model: string
}

/**
 * The API key from the variable `settings.env` names. A missing key is an
 * error rather than a quiet skip: the user turned the check on, so a run
 * without it would look checked when it was not.
 */
export function resolveTypeSafeKey(
  settings: TypeSafeConfig,
  env: Record<string, string | undefined> = process.env
): string {
  const key = env[settings.env]?.trim()
  if (!key) {
    throw new ClaudeCommitError(
      `"typesafe.enable" is on, but $${settings.env} is not set. Export the key, set ` +
        `"typesafe.env" to the variable that holds it, or turn the check off.`
    )
  }
  return key
}

function splitMessage(message: string): { subject: string; body: string } {
  const [subject = '', ...rest] = message.split('\n')
  return { subject: subject.trim(), body: rest.join('\n').trim() }
}

/** Questions and state for one check. Pure, so the exact request is testable. */
export function buildCandidateRequest(
  messages: string[],
  evidence: CandidateEvidence,
  rules: CandidateRules = NO_RULES
): { state: CandidateState; questions: Questions } {
  const split = evidence.lowPriority !== null
  const context = [
    'Candidate git commit messages for one staged change. The subject line of a commit message is its first line.',
    evidence.kind === 'summaries'
      ? '`evidence` holds model-written summaries of the staged diff. They are the only record of what changed.'
      : '`evidence` holds only the paths of the changed files, with no diff content.',
    ...(split
      ? [
          '`evidence.low_priority` covers generated or vendored content such as lockfiles and regenerated docs.',
          'The subject line must describe the changes in `evidence.primary`.'
        ]
      : [])
  ].join(' ')

  const questions: Questions = {}
  messages.forEach((_message, index) => {
    const candidate = `\`candidates[${index}]\``
    const subject = `\`candidates[${index}].subject\``
    questions[`c${index}_subject_shown`] = {
      type: 'noul',
      instructions: `Is the change named in the subject line ${subject} shown in \`evidence\`?`,
      criteria: {
        true: '`evidence` states the change the subject line names',
        false: '`evidence` does not state the change the subject line names'
      }
    }
    questions[`c${index}_edits_shown`] = {
      type: 'noul',
      instructions:
        `Is every file edit or behaviour change that ${candidate} says was made stated in \`evidence\`? ` +
        'Ignore stated reasons and motivations.',
      criteria: {
        true: 'Each edit or behaviour change the message says was made appears in `evidence`',
        false: 'The message says an edit or behaviour change was made that `evidence` does not state'
      }
    }
    if (split) {
      questions[`c${index}_subject_primary`] = {
        type: 'noul',
        instructions: `Does the subject line ${subject} describe a change from \`evidence.primary\`?`,
        criteria: {
          true: 'The subject names or clearly paraphrases a change stated in `evidence.primary`',
          false: 'The subject describes only changes from `evidence.low_priority`, or names no specific change'
        }
      }
    }
    if (rules.customPrompt !== null) {
      questions[`c${index}_follows_custom`] = {
        type: 'noul',
        instructions: `Does ${candidate} follow the instructions in \`custom_instructions\`?`,
        criteria: {
          true: 'The message does what `custom_instructions` asks, or the instructions do not apply to this change',
          false: 'The message ignores or contradicts something `custom_instructions` asks for'
        }
      }
    }
  })
  // Paths alone were never tested for this, so only summaries are judged.
  if (evidence.kind === 'summaries') {
    questions.mixed_commit = {
      type: 'noul',
      instructions:
        'Does `evidence.primary` describe two or more changes that are unrelated to each other, so that each would make sense as its own commit?',
      criteria: {
        true: 'The changes serve different purposes, for example a bug fix and an unrelated feature, or a dependency bump and an unrelated documentation edit',
        false:
          'All changes serve one purpose, including supporting edits such as tests, documentation or configuration for that same change'
      }
    }
  }
  for (const [first, second] of pairs(messages.length)) {
    questions[`dup_${first}_${second}`] = {
      type: 'noul',
      instructions: `Do \`candidates[${first}]\` and \`candidates[${second}]\` describe the same change with the same emphasis, differing only in wording?`,
      criteria: {
        true: 'A person choosing between the two would see no real difference in what each one emphasises',
        false: 'The two emphasise different aspects, areas or effects of the change'
      }
    }
  }

  const state: CandidateState = {
    context,
    evidence:
      evidence.lowPriority === null
        ? { primary: evidence.primary }
        : { primary: evidence.primary, low_priority: evidence.lowPriority },
    candidates: messages.map(splitMessage),
    ...(rules.customPrompt !== null ? { custom_instructions: rules.customPrompt } : {})
  }
  return { state, questions }
}

/** Every index pair `[first, second]` with `first < second`. */
function pairs(count: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let first = 0; first < count; first++) {
    for (let second = first + 1; second < count; second++) out.push([first, second])
  }
  return out
}

function noulValue(answers: Record<string, unknown>, name: string): number {
  const answer = answers[name] as { type?: unknown; noul?: unknown } | undefined
  if (answer?.type !== 'noul' || typeof answer.noul !== 'number' || !Number.isFinite(answer.noul)) {
    throw new ClaudeCommitError(`TypeSafe returned no usable answer for "${name}".`)
  }
  return answer.noul
}

/**
 * The model's order with flagged messages moved last, each group keeping
 * its own order. Used directly when no Jev request runs (a single message,
 * or a failed request), so warnings found in code (see `src/gitmoji.ts`)
 * still sort the options.
 */
export function orderFlaggedLast(
  messages: string[],
  warnings: string[][]
): { messages: string[]; warnings: string[][] } {
  const order = flaggedLastOrder(messages.length, warnings)
  return {
    messages: order.map((index) => messages[index] ?? ''),
    warnings: order.map((index) => warnings[index] ?? [])
  }
}

/** Indices `0..count-1`, unflagged first, each group in its original order. */
function flaggedLastOrder(count: number, warnings: string[][]): number[] {
  const flagged = (index: number) => Number((warnings[index] ?? []).length > 0)
  return Array.from({ length: count }, (_unused, index) => index).sort(
    (left, right) => flagged(left) - flagged(right) || left - right
  )
}

/**
 * Turn Jev's answers into the order the picker shows: the model's own
 * order, with flagged candidates moved last, and a candidate dropped when
 * a near-duplicate already sits above it. `priorWarnings` - found in code
 * before the request - count as flags too.
 *
 * The model's order is kept on purpose. In a blind comparison over 37
 * commits (opus and several local models), every attempt to reorder passing
 * candidates - by a specificity score, or by asking Jev which option a
 * maintainer would keep - lost to the model's first option (1 win in 26).
 *
 * Every expected answer is read before anything is decided, so a missing
 * one is an error rather than a silent pass.
 */
export function rankCandidates(
  messages: string[],
  evidence: CandidateEvidence,
  answers: Record<string, unknown>,
  rules: CandidateRules = NO_RULES,
  priorWarnings: string[][] = []
): RankedCandidates {
  const doesNotShow = evidence.kind === 'summaries' ? 'the summaries do not show' : 'the file list does not show'
  const assessed = messages.map((message, index) => {
    const warnings: string[] = [...(priorWarnings[index] ?? [])]
    if (noulValue(answers, `c${index}_subject_shown`) < SUBJECT_NOT_SHOWN_BELOW) {
      warnings.push(`subject names a change ${doesNotShow}`)
    }
    if (noulValue(answers, `c${index}_edits_shown`) < EDITS_NOT_SHOWN_BELOW) {
      warnings.push(`describes an edit ${doesNotShow}`)
    }
    if (evidence.lowPriority !== null && noulValue(answers, `c${index}_subject_primary`) < NOT_PRIMARY_BELOW) {
      warnings.push('subject is about the low-priority changes')
    }
    if (rules.customPrompt !== null && noulValue(answers, `c${index}_follows_custom`) < FOLLOWS_CUSTOM_BELOW) {
      warnings.push('ignores your custom instructions')
    }
    return { index, message, warnings }
  })
  const duplicates = new Map<string, number>()
  for (const [first, second] of pairs(messages.length)) {
    duplicates.set(`${first}_${second}`, noulValue(answers, `dup_${first}_${second}`))
  }

  const ordered = flaggedLastOrder(
    assessed.length,
    assessed.map((candidate) => candidate.warnings)
  ).map((index) => assessed[index] as (typeof assessed)[number])
  const kept: typeof assessed = []
  for (const candidate of ordered) {
    const duplicateOfKept = kept.some((better) => {
      const key = `${Math.min(better.index, candidate.index)}_${Math.max(better.index, candidate.index)}`
      return (duplicates.get(key) ?? 0) >= DUPLICATE_FROM
    })
    if (!duplicateOfKept) kept.push(candidate)
  }

  return {
    messages: kept.map((candidate) => candidate.message),
    warnings: kept.map((candidate) => candidate.warnings),
    droppedDuplicates: messages.length - kept.length,
    mixedCommit: evidence.kind === 'summaries' && noulValue(answers, 'mixed_commit') >= MIXED_FROM
  }
}

/** Options for one {@link checkCandidates} call. */
export interface CheckCandidatesOptions {
  apiKey: string
  settings: TypeSafeConfig
  /** What the user asked of every message; defaults to no custom instructions. */
  rules?: CandidateRules
  /** Warnings already found in code, aligned with the messages. */
  priorWarnings?: string[][]
  /** HTTP transport for the SDK; tests supply a stand-in. Defaults to the global `fetch`. */
  fetch?: Fetch
  signal?: AbortSignal
}

/**
 * Check and rank `messages` with one Jev request. Rejects on any API or
 * answer failure: a failed check must never look like a clean pass.
 */
export async function checkCandidates(
  messages: string[],
  evidence: CandidateEvidence,
  options: CheckCandidatesOptions
): Promise<CheckedCandidates> {
  const { apiKey, settings, rules = NO_RULES, priorWarnings = [], fetch, signal } = options
  const client = new TypeSafeClient({
    apiKey,
    defaultModel: settings.model,
    timeout: settings.timeout,
    retry: { maxRetries: RETRIES },
    // cco reports failures itself; SDK warnings would scribble over the spinner.
    logLevel: 'off',
    ...(fetch ? { fetch } : {})
  })
  const { state, questions } = buildCandidateRequest(messages, evidence, rules)
  const result = await client.systemOne({ state, questions, model: settings.model }, signal ? { signal } : {})
  return {
    ...rankCandidates(messages, evidence, result.answers as Record<string, unknown>, rules, priorWarnings),
    inputTokens: result.usage.input_tokens,
    model: result.model
  }
}
