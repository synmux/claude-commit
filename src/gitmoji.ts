/**
 * The gitmoji cco offers, what each means and which Conventional Commit
 * types it fits. One table feeds both the guide in the final prompt and the
 * check that warns when an option pairs a gitmoji with a type it does not
 * fit, such as `🔧 feat(config): ...`. The check runs only with
 * `typesafe.enable` on (see `src/generate.ts`).
 *
 * The check is a lookup rather than a model judgment on purpose. On 251
 * generated options it found all 9 conflicts with no false flags, where a
 * Jev yes/no question caught 4, falsely flagged 1, and scored two
 * identical `🔧 feat(config)` subjects 0.08 and 0.51.
 */

/** One gitmoji: the emoji, its meaning, and the types it fits (`'any'` for all). */
interface Gitmoji {
  emoji: string
  meaning: string
  types: readonly string[] | 'any'
}

/**
 * The gitmoji in the final prompt's guide. `types` is permissive: a
 * pairing is flagged only when the meanings clearly clash.
 */
const GITMOJI: readonly Gitmoji[] = [
  { emoji: '✨', meaning: 'new feature', types: ['feat'] },
  { emoji: '🐛', meaning: 'bug fix', types: ['fix'] },
  { emoji: '📝', meaning: 'documentation', types: ['docs'] },
  { emoji: '♻️', meaning: 'refactor', types: ['refactor'] },
  { emoji: '⚡️', meaning: 'performance', types: ['perf'] },
  { emoji: '✅', meaning: 'tests', types: ['test', 'fix'] },
  {
    emoji: '🔧',
    meaning: 'configuration / tooling',
    types: ['chore', 'build', 'ci', 'fix']
  },
  {
    emoji: '🎨',
    meaning: 'structure / formatting',
    types: ['style', 'refactor']
  },
  { emoji: '🚚', meaning: 'move / rename', types: ['refactor', 'chore'] },
  {
    emoji: '🔥',
    meaning: 'remove code or files',
    types: ['refactor', 'chore', 'fix']
  },
  {
    emoji: '⬆️',
    meaning: 'upgrade dependencies',
    types: ['chore', 'build', 'ci', 'fix']
  },
  { emoji: '👷', meaning: 'CI build system', types: ['ci', 'build'] },
  { emoji: '🚑️', meaning: 'critical hotfix', types: ['fix'] },
  { emoji: '🔒️', meaning: 'security', types: 'any' }
]

/** The guide sent to the final model, e.g. `✨ new feature, 🐛 bug fix, ...`. */
export const GITMOJI_GUIDE = GITMOJI.map((gitmoji) => `${gitmoji.emoji} ${gitmoji.meaning}`).join(', ')

/** Variation selectors are optional in practice (`⚡` and `⚡️` are the same gitmoji). */
function bare(emoji: string): string {
  return emoji.replace(/\uFE0F/g, '')
}

const TYPES_BY_EMOJI = new Map(GITMOJI.map((gitmoji) => [bare(gitmoji.emoji), gitmoji.types]))

/** A leading emoji, then a Conventional Commit type with optional scope and `!`. */
const SUBJECT = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s+([a-z]+)(?:\([^)]*\))?!?:/u

/**
 * Whether `message`'s subject pairs a gitmoji from the guide with a type it
 * does not fit. A subject without that shape, or with an emoji outside the
 * guide, is never flagged: there is nothing to compare it against.
 */
export function gitmojiConflictsWithType(message: string): boolean {
  const match = (message.split('\n', 1)[0] ?? '').match(SUBJECT)
  if (!match) return false
  const types = TYPES_BY_EMOJI.get(bare(match[1] ?? ''))
  if (types === undefined || types === 'any') return false
  return !types.includes(match[2] ?? '')
}
