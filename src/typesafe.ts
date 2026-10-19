/**
 * The TypeSafe candidate check: after the final model writes several
 * candidate messages, one request to TypeSafe's Jev model judges each of
 * them against the evidence it was written from, and the picker shows them
 * best first.
 *
 *   candidates + evidence ──Jev──▶ yes/no and score answers ──code──▶ ranked, flagged, deduplicated
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

/** The state sent to Jev. A type alias so it satisfies the SDK's JSON state type. */
export type CandidateState = {
  context: string
  evidence: { primary: string; low_priority?: string }
  candidates: Array<{ subject: string; body: string }>
}

/** Candidates in the order to show them, with near-duplicates removed. */
export interface RankedCandidates {
  messages: string[]
  /** Why each candidate is doubtful, aligned with `messages`; empty when it passed. */
  warnings: string[][]
  /** How many candidates were dropped as near-duplicates of a better one. */
  droppedDuplicates: number
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
  evidence: CandidateEvidence
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
    questions[`c${index}_specificity`] = {
      type: 'score',
      instructions: `How specifically does the subject line ${subject} say what changed?`,
      criteria: [
        "The subject could describe almost any commit, such as 'update files' or 'misc fixes'",
        'The subject names the affected area but not what changed in it',
        'The subject names the affected area and the kind of change',
        'The subject names the specific change and its effect, so a reader of `git log --oneline` knows what changed without opening the commit'
      ]
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
  })
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
    candidates: messages.map(splitMessage)
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

function answerValue(answers: Record<string, unknown>, name: string, type: 'noul' | 'score'): number {
  const answer = answers[name] as { type?: unknown; noul?: unknown; score?: unknown } | undefined
  const value = type === 'noul' ? answer?.noul : answer?.score
  if (answer?.type !== type || typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ClaudeCommitError(`TypeSafe returned no usable answer for "${name}".`)
  }
  return value
}

/**
 * Turn Jev's answers into the order the picker shows. Candidates without a
 * warning come first, then by specificity, keeping the model's order on
 * ties; a candidate whose near-duplicate already ranked higher is dropped.
 * Every expected answer is read before anything is decided, so a missing
 * one is an error rather than a silent pass.
 */
export function rankCandidates(
  messages: string[],
  evidence: CandidateEvidence,
  answers: Record<string, unknown>
): RankedCandidates {
  const doesNotShow = evidence.kind === 'summaries' ? 'the summaries do not show' : 'the file list does not show'
  const assessed = messages.map((message, index) => {
    const warnings: string[] = []
    if (answerValue(answers, `c${index}_subject_shown`, 'noul') < SUBJECT_NOT_SHOWN_BELOW) {
      warnings.push(`subject names a change ${doesNotShow}`)
    }
    if (answerValue(answers, `c${index}_edits_shown`, 'noul') < EDITS_NOT_SHOWN_BELOW) {
      warnings.push(`describes an edit ${doesNotShow}`)
    }
    if (
      evidence.lowPriority !== null &&
      answerValue(answers, `c${index}_subject_primary`, 'noul') < NOT_PRIMARY_BELOW
    ) {
      warnings.push('subject is about the low-priority changes')
    }
    return { index, message, warnings, specificity: answerValue(answers, `c${index}_specificity`, 'score') }
  })
  const duplicates = new Map<string, number>()
  for (const [first, second] of pairs(messages.length)) {
    duplicates.set(`${first}_${second}`, answerValue(answers, `dup_${first}_${second}`, 'noul'))
  }

  const ordered = [...assessed].sort(
    (left, right) =>
      Number(left.warnings.length > 0) - Number(right.warnings.length > 0) ||
      right.specificity - left.specificity ||
      left.index - right.index
  )
  const kept: typeof ordered = []
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
    droppedDuplicates: messages.length - kept.length
  }
}

/** Options for one {@link checkCandidates} call. */
export interface CheckCandidatesOptions {
  apiKey: string
  settings: TypeSafeConfig
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
  const { apiKey, settings, fetch, signal } = options
  const client = new TypeSafeClient({
    apiKey,
    defaultModel: settings.model,
    timeout: settings.timeout,
    retry: { maxRetries: RETRIES },
    // cco reports failures itself; SDK warnings would scribble over the spinner.
    logLevel: 'off',
    ...(fetch ? { fetch } : {})
  })
  const { state, questions } = buildCandidateRequest(messages, evidence)
  const result = await client.systemOne({ state, questions, model: settings.model }, signal ? { signal } : {})
  return {
    ...rankCandidates(messages, evidence, result.answers as Record<string, unknown>),
    inputTokens: result.usage.input_tokens,
    model: result.model
  }
}
