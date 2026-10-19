/**
 * Test doubles for the TypeSafe API, shared by the typesafe and generate
 * tests. Only the HTTP transport is faked: the real SDK client builds the
 * request and parses the reply.
 */
import type { Questions } from '@typesafe-ai/sdk'

/**
 * A plausible answer for every question: support questions pass, near-
 * duplicate questions say "different", scores sit at 2. `overrides` sets a
 * Noul probability or a Score position by question name.
 */
export function jevAnswers(questions: Questions, overrides: Record<string, number> = {}): Record<string, unknown> {
  const answers: Record<string, unknown> = {}
  for (const [name, question] of Object.entries(questions)) {
    const value = overrides[name]
    if (question.type === 'score') {
      answers[name] = { type: 'score', score: value ?? 2, confidence: 0.9, legend: {}, probabilities: {} }
    } else {
      answers[name] = { type: 'noul', noul: value ?? (name.startsWith('dup_') ? 0.05 : 0.95) }
    }
  }
  return answers
}

/** One request the fake transport received. */
export interface RecordedJevRequest {
  url: string
  headers: Headers
  body: { model: string; state: Record<string, unknown>; questions: Questions }
}

/**
 * A `fetch` stand-in that records each request and replies with whatever
 * `reply` returns for its body.
 */
export function fakeJevFetch(reply: (body: RecordedJevRequest['body']) => { status: number; json: unknown }) {
  const requests: RecordedJevRequest[] = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as RecordedJevRequest['body']
    requests.push({ url, headers: new Headers(init?.headers), body })
    const { status, json } = reply(body)
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch, requests }
}

/** A transport that answers every question, applying `overrides`. */
export function answeringJevFetch(overrides: Record<string, number> = {}) {
  return fakeJevFetch((body) => ({
    status: 200,
    json: {
      model: 'jev-1.13.0',
      answers: jevAnswers(body.questions, overrides),
      usage: { input_tokens: 1500, output_tokens: 0 }
    }
  }))
}
