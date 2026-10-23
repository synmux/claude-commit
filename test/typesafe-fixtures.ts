/**
 * Test doubles for the TypeSafe API, shared by the typesafe and generate
 * tests. Only the HTTP transport is faked: the real SDK client builds the
 * request and parses the reply.
 */
import { zstdDecompressSync } from 'node:zlib'
import type { Questions } from '@typesafe-ai/sdk'

/**
 * The request body as the JSON text the SDK built. From 0.7.0 the SDK
 * zstd-compresses any body of 1 KiB or more and sends it as bytes, so a
 * stand-in transport has to undo that before it can read the request.
 */
function decodeRequestBody(body: RequestInit['body'], headers: Headers): string {
  if (typeof body === 'string') return body
  if (!(body instanceof Uint8Array)) {
    throw new Error(`fakeJevFetch cannot decode a ${Object.prototype.toString.call(body)} body`)
  }
  const bytes = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(body) : body
  return Buffer.from(bytes).toString('utf8')
}

/**
 * A plausible answer for every question: support questions pass, while the
 * near-duplicate and mixed-commit questions (where yes is bad) say no.
 * Scores sit at 2. `overrides` sets a Noul probability or a Score position
 * by question name.
 */
export function jevAnswers(questions: Questions, overrides: Record<string, number> = {}): Record<string, unknown> {
  const answers: Record<string, unknown> = {}
  for (const [name, question] of Object.entries(questions)) {
    const value = overrides[name]
    if (question.type === 'score') {
      answers[name] = {
        type: 'score',
        score: value ?? 2,
        confidence: 0.9,
        legend: {},
        probabilities: {}
      }
    } else {
      const yesIsBad = name.startsWith('dup_') || name === 'mixed_commit'
      answers[name] = { type: 'noul', noul: value ?? (yesIsBad ? 0.05 : 0.95) }
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
export function fakeJevFetch(
  reply: (body: RecordedJevRequest['body']) => {
    status: number
    json: unknown
  }
) {
  const requests: RecordedJevRequest[] = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers)
    const body = JSON.parse(decodeRequestBody(init?.body, headers)) as RecordedJevRequest['body']
    requests.push({ url, headers, body })
    const { status, json } = reply(body)
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
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
