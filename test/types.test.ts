import { expect, expectTypeOf, test } from 'vitest'
import type { ArmorAlphabet as PackageArmorAlphabet, Config as PackageConfig } from '../index.ts'
import { DEFAULT_CONFIG } from '../src/config.ts'
import type { Config, ModelConfig } from '../src/types.ts'

test('the package entry names the type armorAlphabets takes', () => {
  expectTypeOf<PackageConfig['armorAlphabets']>().toEqualTypeOf<PackageArmorAlphabet[]>()
  expectTypeOf<PackageArmorAlphabet>().toEqualTypeOf<'base64' | 'base85' | 'hex'>()
})

test('legacy model configuration without a commits field remains assignable', () => {
  const models: ModelConfig = { summary: 'sonnet', final: 'haiku' }
  const config: Config = { ...DEFAULT_CONFIG, models }
  expect(config.models.commits).toBeUndefined()
  expect(DEFAULT_CONFIG.models.commits).toBeNull()
})

test('formatting options accept existing booleans but reads are nullable', () => {
  const config: Config = {
    ...DEFAULT_CONFIG,
    conventionalCommits: true,
    gitmoji: false,
    multiline: true
  }
  expect(config.conventionalCommits).toBe(true)
  expectTypeOf<Config['conventionalCommits']>().toEqualTypeOf<boolean | null>()
  expectTypeOf<Config['gitmoji']>().toEqualTypeOf<boolean | null>()
  expectTypeOf<Config['multiline']>().toEqualTypeOf<boolean | null>()
  // @ts-expect-error Consumers assigning a nullable option to boolean need normalization.
  const multiline: boolean = config.multiline
  expect(multiline).toBe(true)
})
