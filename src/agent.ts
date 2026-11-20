/**
 * The model-call layer: {@link runPrompt} turns one prompt into one text
 * completion from Claude, through the Agent SDK.
 *
 * The Agent SDK spawns a bundled `claude` binary, so authentication follows
 * Claude Code's own resolution order over the environment we hand it. By
 * default the API credential variables (`ANTHROPIC_API_KEY` /
 * `ANTHROPIC_AUTH_TOKEN`) are stripped from that environment, forcing the
 * `claude login` subscription session so the cost is bundled with Claude Code
 * usage; the `allowApiKey` config option passes them through for explicit
 * pay-as-you-go billing. Every request runs fully isolated from the user's
 * Claude Code configuration - no tools, skills, MCP servers, plugins, or
 * settings (see {@link buildQueryOptions}) - so the request contains nothing
 * beyond the prompt we build.
 */
import {
  type ModelInfo,
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { ClaudeCommitError } from './errors.ts'
import type { ModelResult, RunPromptOptions } from './types.ts'

export type { RunPromptOptions } from './types.ts'

export const GATED_CREDENTIAL_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const

/**
 * Names of the gated credential variables present in `env`. An empty string
 * counts as present, since presence alone perturbs credential resolution.
 */
export function presentCredentialVars(env: Record<string, string | undefined>): string[] {
  return GATED_CREDENTIAL_VARS.filter((name) => env[name] !== undefined)
}

export interface SubprocessEnvOptions {
  /** Environment to derive the subprocess environment from (usually `process.env`). */
  baseEnv: Record<string, string | undefined>
  /**
   * Pass API credential variables through instead of stripping them.
   * Defaults to false so the gate fails safe when a caller omits it.
   */
  allowApiKey?: boolean
}

/**
 * Build the environment for the Claude Agent SDK subprocess, or return
 * `undefined` when the parent environment can be inherited unchanged.
 *
 * Unless `allowApiKey` is set, API credential variables are removed so the
 * spawned `claude` binary always authenticates with the user's subscription
 * session - an exported `ANTHROPIC_API_KEY` must never silently switch
 * billing to pay-as-you-go.
 */
export function buildSubprocessEnv(opts: SubprocessEnvOptions): Record<string, string | undefined> | undefined {
  const { baseEnv, allowApiKey = false } = opts
  const stripped = allowApiKey ? [] : presentCredentialVars(baseEnv)
  if (stripped.length === 0) return undefined

  const env = { ...baseEnv }
  for (const name of stripped) delete env[name]
  return env
}

/**
 * Map a known SDK assistant error code to a friendlier, actionable message.
 * An unrecognised code - `invalid_request` among them - keeps the CLI's own
 * error text as `detail`, since that is the only place "Prompt is too long"
 * survives for the overflow retry to see.
 */
function describeAssistantError(code: string, detail?: string): string {
  switch (code) {
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
      return (
        'Authentication failed. Run `claude login` to sign in with your Claude ' +
        'subscription, or set ANTHROPIC_API_KEY and enable `allowApiKey` in ' +
        'your global claude-commit config.'
      )
    case 'billing_error':
      return 'Billing error from the Claude API. Check your plan or API credits.'
    case 'rate_limit':
      return 'Rate limited by the Claude API. Try again shortly.'
    case 'overloaded':
      return 'The Claude API is overloaded. Try again shortly.'
    case 'model_not_found':
      return 'The requested model was not found. Check the configured model name.'
    case 'max_output_tokens':
      return 'The model hit its output limit before finishing.'
    default:
      return detail ? `Model request failed (${code}): ${detail}` : `Model request failed (${code}).`
  }
}

/**
 * Build the Agent SDK options for one isolated, single-turn text completion.
 *
 * Isolation is layered because the SDK gates each context source separately:
 *
 * - `settingSources: []` disables settings files and `CLAUDE.md` - and only
 *   those. It does NOT stop MCP servers or skills from loading.
 * - `mcpServers: {}` + `strictMcpConfig: true` ignore every MCP server
 *   configured in `~/.claude.json`, project `.mcp.json`, and plugins.
 * - `skills: []` disables skill discovery, which the CLI otherwise performs
 *   even when the `skills` option is omitted entirely.
 * - `tools: []` and `plugins: []` drop all built-in tools and plugins.
 *
 * Omitting any of these lets the user's global Claude Code configuration
 * (MCP tool schemas, skill listings - easily hundreds of thousands of tokens
 * on a busy setup) into every request; with all of them set, live probes
 * measure ~170 input tokens per request. Historical note: the 2026-07
 * "Prompt is too long" failures were ultimately caused by underestimating
 * the token density of armored diff content (see `estimateDiffTokens`), not
 * by this leak - the isolation is hygiene and cost control, not the fix for
 * that bug.
 */
export function buildQueryOptions(opts: RunPromptOptions, subprocessEnv?: Record<string, string | undefined>): Options {
  return {
    model: opts.model,
    systemPrompt: opts.system,
    tools: [], // pure text completion: no Bash/Read/Edit/etc.
    skills: [],
    mcpServers: {},
    strictMcpConfig: true,
    plugins: [],
    settingSources: [],
    maxTurns: 1,
    includePartialMessages: Boolean(opts.onText),
    ...(opts.abortController ? { abortController: opts.abortController } : {}),
    ...(opts.onStderr ? { stderr: opts.onStderr } : {}),
    ...(subprocessEnv ? { env: subprocessEnv } : {}),
    ...(opts.outputFormat ? { outputFormat: opts.outputFormat } : {})
  }
}

export async function validateCommitStyleModel(
  model: string,
  opts: { allowApiKey: boolean; abortController?: AbortController },
  queryRunner: typeof query = query
): Promise<void> {
  let releaseInput: (() => void) | undefined
  const heldInput = new Promise<void>((resolve) => {
    releaseInput = resolve
  })
  const input: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        await heldInput
        return { done: true, value: undefined }
      }
    })
  }
  const env = buildSubprocessEnv({
    baseEnv: process.env,
    allowApiKey: opts.allowApiKey
  })
  const options = buildQueryOptions({ model: '', system: '', ...opts }, env)
  delete options.model
  let session: ReturnType<typeof query> | undefined
  let models: ModelInfo[]
  try {
    session = queryRunner({ prompt: input, options })
    models = await session.supportedModels()
  } catch (error) {
    if (opts.abortController?.signal.aborted) {
      throw new ClaudeCommitError('Generation was cancelled.')
    }
    throw new ClaudeCommitError(`Cannot verify models.commits: ${(error as Error).message}`)
  } finally {
    releaseInput?.()
    session?.close()
  }
  if (!models.some((entry) => entry.value === model || entry.resolvedModel === model)) {
    throw new ClaudeCommitError(
      `models.commits "${model}" is not a valid model. Fix or remove it. Available models: ${models.map((entry) => entry.value).join(', ') || '(none)'}.`
    )
  }
}

/**
 * Run a single prompt against a Claude model via the Agent SDK, and return
 * its text response.
 *
 * This is the single seam every caller uses; `generate.ts` accepts a
 * replacement of exactly this shape so the pipeline can be tested without a
 * model. `queryRunner` stands in for the SDK's `query` in this module's own
 * tests.
 *
 * Throws {@link ClaudeCommitError} on any model/authentication/quota failure.
 */
export async function runPrompt(
  prompt: string,
  opts: RunPromptOptions,
  queryRunner: typeof query = query
): Promise<ModelResult> {
  const subprocessEnv = buildSubprocessEnv({
    baseEnv: process.env,
    allowApiKey: opts.allowApiKey ?? false
  })
  const options = buildQueryOptions(opts, subprocessEnv)

  let resultText: string | null = null
  let costUsd = 0
  let model: string | undefined
  let structured: unknown
  let assistantError: string | undefined
  // A `success` result with `is_error` carries the API error text, not an answer.
  let errorResultText: string | undefined
  // The error the stream reported, if any. It outranks a later SDK failure:
  // after an error result the CLI exits non-zero, and the SDK's message for
  // that may drop both the advice for a known code and "Prompt is too long".
  const reportedFailure = (): ClaudeCommitError | undefined => {
    if (assistantError) return new ClaudeCommitError(describeAssistantError(assistantError, errorResultText))
    if (errorResultText !== undefined) {
      return new ClaudeCommitError(`Model run failed: ${errorResultText || 'the API reported an error'}`)
    }
    return undefined
  }

  try {
    const response = queryRunner({ prompt, options })
    for await (const message of response as AsyncIterable<SDKMessage>) {
      switch (message.type) {
        case 'stream_event': {
          if (opts.onText) {
            const event = message.event as {
              type?: string
              delta?: { type?: string; text?: string }
            }
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              opts.onText(event.delta.text ?? '')
            }
          }
          break
        }
        case 'assistant': {
          if (message.error) assistantError = message.error
          break
        }
        case 'result': {
          costUsd = message.total_cost_usd ?? 0
          // The served model is the (only) key of modelUsage, when present.
          const usedModels = Object.keys(message.modelUsage ?? {})
          if (usedModels.length > 0) model = usedModels[0]
          if (message.subtype === 'success' && message.is_error) {
            errorResultText = message.result.trim()
          } else if (message.subtype === 'success') {
            resultText = message.result
            structured = message.structured_output
          } else {
            const detail = 'errors' in message && message.errors.length ? message.errors.join('; ') : message.subtype
            throw new ClaudeCommitError(`Model run failed: ${detail}`)
          }
          break
        }
        default:
          break
      }
    }
  } catch (err) {
    if (err instanceof ClaudeCommitError) throw err
    if (opts.abortController?.signal.aborted) {
      throw new ClaudeCommitError('Generation was cancelled.')
    }
    throw reportedFailure() ?? new ClaudeCommitError(`Failed to call the Claude Agent SDK: ${(err as Error).message}`)
  }

  const failure = reportedFailure()
  if (failure) throw failure
  if (resultText === null) {
    throw new ClaudeCommitError('The model returned no result.')
  }

  return {
    text: resultText.trim(),
    costUsd,
    ...(model ? { model } : {}),
    ...(structured !== undefined ? { structured } : {})
  }
}
