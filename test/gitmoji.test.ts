import { describe, expect, test } from 'vitest'
import { GITMOJI_GUIDE, gitmojiConflictsWithType } from '../src/gitmoji.ts'

describe('GITMOJI_GUIDE', () => {
  test('lists every gitmoji with its meaning, in prompt order', () => {
    expect(GITMOJI_GUIDE).toBe(
      '✨ new feature, 🐛 bug fix, 📝 documentation, ♻️ refactor, ⚡️ performance, ✅ tests, ' +
        '🔧 configuration / tooling, 🎨 structure / formatting, 🚚 move / rename, 🔥 remove code or files, ' +
        '⬆️ upgrade dependencies, 👷 CI build system, 🚑️ critical hotfix, 🔒️ security'
    )
  })
})

describe('gitmojiConflictsWithType', () => {
  test.each([
    '🔧 feat(config): send full diff content by default',
    '⚡️ feat(defaults): make filenamesOnly opt-in',
    '📝 feat(api)!: document and enforce credential stripping',
    '✨ fix: correct the version string'
  ])('flags a clash: %s', (message) => {
    expect(gitmojiConflictsWithType(message)).toBe(true)
  })

  test.each([
    '✨ feat(ui): add a configurable spinner',
    '🐛 fix: stop PARTY_TIME=0 from enabling the animation',
    '🔧 fix(ci): remove quotes from claude_args',
    '⚡ perf: skip ciphertext before summarising',
    '🔒️ feat(agent): gate API credentials behind allowApiKey',
    '🙈 chore(gitignore): ignore .bandit/',
    'feat: no gitmoji at all',
    '✨ Add a feature without a conventional type'
  ])('leaves alone: %s', (message) => {
    expect(gitmojiConflictsWithType(message)).toBe(false)
  })

  test('reads only the subject line', () => {
    expect(gitmojiConflictsWithType('✨ feat: add search\n\n🔧 fix: not a subject')).toBe(false)
  })
})
