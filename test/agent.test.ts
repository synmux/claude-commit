import { describe, expect, test } from 'vitest'
import { buildQueryOptions, buildSubprocessEnv, presentCredentialVars } from '../src/agent.ts'

/** `buildSubprocessEnv` for a case that must produce an env, as a non-optional value. */
function builtEnv(opts: Parameters<typeof buildSubprocessEnv>[0]): Record<string, string | undefined> {
  return buildSubprocessEnv(opts) ?? expect.unreachable('expected a subprocess env to be built')
}

const cleanEnv = { PATH: '/usr/bin', HOME: '/home/user' }

describe('presentCredentialVars', () => {
  test('returns an empty list when no credential vars are set', () => {
    expect(presentCredentialVars(cleanEnv)).toEqual([])
  })

  test('lists every credential var that is present', () => {
    expect(presentCredentialVars({ ...cleanEnv, ANTHROPIC_API_KEY: 'sk-test' })).toEqual(['ANTHROPIC_API_KEY'])
    expect(
      presentCredentialVars({
        ...cleanEnv,
        ANTHROPIC_API_KEY: 'sk-test',
        ANTHROPIC_AUTH_TOKEN: 'token'
      })
    ).toEqual(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'])
  })

  test('counts an empty string as present', () => {
    expect(presentCredentialVars({ ...cleanEnv, ANTHROPIC_AUTH_TOKEN: '' })).toEqual(['ANTHROPIC_AUTH_TOKEN'])
  })

  test('treats explicit undefined values as absent', () => {
    expect(presentCredentialVars({ ...cleanEnv, ANTHROPIC_API_KEY: undefined })).toEqual([])
  })
})

describe('buildSubprocessEnv', () => {
  test('inherits the parent env when there is nothing to change', () => {
    expect(buildSubprocessEnv({ baseEnv: cleanEnv, allowApiKey: false })).toBeUndefined()
    expect(
      buildSubprocessEnv({
        baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: 'sk-test' },
        allowApiKey: true
      })
    ).toBeUndefined()
  })

  test('strips ANTHROPIC_API_KEY when the gate is off', () => {
    const env = builtEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: 'sk-test' },
      allowApiKey: false
    })
    expect(Object.keys(env)).not.toContain('ANTHROPIC_API_KEY')
    expect(env.PATH).toBe('/usr/bin')
  })

  test('strips ANTHROPIC_AUTH_TOKEN when the gate is off', () => {
    const env = builtEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_AUTH_TOKEN: 'token' },
      allowApiKey: false
    })
    expect(Object.keys(env)).not.toContain('ANTHROPIC_AUTH_TOKEN')
  })

  test('strips credentials that are set to an empty string', () => {
    const env = builtEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: '' },
      allowApiKey: false
    })
    expect(Object.keys(env)).not.toContain('ANTHROPIC_API_KEY')
  })

  test('defaults to stripping when allowApiKey is omitted', () => {
    const env = builtEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: 'sk-test' }
    })
    expect(Object.keys(env)).not.toContain('ANTHROPIC_API_KEY')
  })

  test('does not mutate the base environment', () => {
    const baseEnv = { ...cleanEnv, ANTHROPIC_API_KEY: 'sk-test' }
    buildSubprocessEnv({ baseEnv, allowApiKey: false })
    expect(baseEnv.ANTHROPIC_API_KEY).toBe('sk-test')
  })
})

describe('buildQueryOptions', () => {
  const baseOpts = { model: 'sonnet', system: 'You write commit messages.' }

  test("isolates the run from the user's Claude Code configuration", () => {
    const options = buildQueryOptions(baseOpts)
    // Every context source has its own switch; all of them must be off,
    // or the user's global MCP servers / skills / plugins leak into the
    // request and can overflow the context window on their own.
    expect(options.tools).toEqual([])
    expect(options.skills).toEqual([])
    expect(options.mcpServers).toEqual({})
    expect(options.strictMcpConfig).toBe(true)
    expect(options.plugins).toEqual([])
    expect(options.settingSources).toEqual([])
    expect(options.maxTurns).toBe(1)
  })

  test('passes the model and system prompt through', () => {
    const options = buildQueryOptions(baseOpts)
    expect(options.model).toBe('sonnet')
    expect(options.systemPrompt).toBe('You write commit messages.')
  })

  test('enables partial messages only when a text callback is given', () => {
    expect(buildQueryOptions(baseOpts).includePartialMessages).toBe(false)
    expect(buildQueryOptions({ ...baseOpts, onText: () => {} }).includePartialMessages).toBe(true)
  })

  test('attaches the subprocess env only when one was built', () => {
    expect(buildQueryOptions(baseOpts).env).toBeUndefined()
    const subprocessEnv = { PATH: '/usr/bin' }
    expect(buildQueryOptions(baseOpts, subprocessEnv).env).toBe(subprocessEnv)
  })

  test('passes the structured output format through', () => {
    const outputFormat = {
      type: 'json_schema' as const,
      schema: { type: 'object' }
    }
    expect(buildQueryOptions(baseOpts).outputFormat).toBeUndefined()
    expect(buildQueryOptions({ ...baseOpts, outputFormat }).outputFormat).toBe(outputFormat)
  })
})
