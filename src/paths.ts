/**
 * Path matching for the path-list configuration options - `lowPriorityPaths`
 * (weigh these changes less) and `ignore` (do not read these changes at all).
 * Both take the same pattern language, so both compile through here.
 *
 * Patterns follow gitignore conventions rather than raw glob semantics,
 * because that is what users reach for when they write
 * `.agents/skills/*-skilld` and expect it to cover every file beneath each
 * matching directory. `picomatch` does the wildcard work (`*` matches
 * dotfiles via `dot: true`, `**` crosses directories, braces expand, `\`
 * escapes and is never a separator); this module adds the gitignore-style
 * rules on top:
 *
 * - A pattern containing a `/` (anywhere but the end) is anchored at the
 *   repository root and matches a path when the glob matches the path
 *   itself **or any ancestor directory** of it.
 * - A pattern without a `/` matches when the glob matches **any path
 *   segment** - the file's basename or any ancestor directory's name - so
 *   `pnpm-lock.yaml` or `*-skilld` apply at any depth.
 * - A leading `/` or `./` anchors a pattern that would otherwise be bare; a
 *   trailing `/` is accepted (gitignore's "directory only" marker) and
 *   ignored, since the ancestor rule already covers a directory's contents.
 * - A leading `!` negates: patterns are evaluated in order and the last one
 *   that matches decides, so `["docs/**", "!docs/adr/**"]` selects
 *   docs except the ADRs. `\!` matches a literal leading bang.
 *
 * Paths are always repository-root-relative with `/` separators, which is
 * what git emits on every platform (`getStagedDiff` forces `--no-relative`);
 * a backslash in a path is a filename character, never a separator. The
 * anchored/bare decision is made on the whole pattern text, so a `/` inside
 * a brace group anchors every alternative - prefer one pattern per intent.
 *
 * An ill-formed pattern never throws, but `picomatch` parses it rather than
 * rejecting it, so what it matches is not always obvious: an unbalanced `{`
 * matches nothing at all (`{docs,build` matches neither `docs` nor `build`),
 * while an unterminated `[` falls back to its literal text (`[abc` matches a
 * file called `[abc`). Should the compiler ever throw, the pattern is kept as
 * one that matches nothing. No construction-time check can catch this -
 * gitignore does not validate either - so the failure mode is a silently
 * mis-classified diff, made visible by the `--verbose` match counts rather
 * than prevented.
 */
import picomatch from 'picomatch'

/** A predicate over repository-relative paths. */
export type PathMatcher = (path: string) => boolean

/** The picomatch options every pattern compiles with: dotfiles are ordinary files. */
const GLOB_OPTIONS: picomatch.PicomatchOptions = { dot: true }

/** A compiled glob: does `candidate` (a path or a single segment) match? */
type GlobMatcher = (candidate: string) => boolean

/** A pattern the glob compiler rejected outright: it marks nothing. */
const NEVER_MATCHES: GlobMatcher = () => false

/** Compile a glob, falling back to {@link NEVER_MATCHES} if picomatch throws. */
function compileGlob(pattern: string): GlobMatcher {
  try {
    const matcher = picomatch(pattern, GLOB_OPTIONS)
    return (candidate) => matcher(candidate)
  } catch {
    return NEVER_MATCHES
  }
}

interface CompiledPattern {
  glob: GlobMatcher
  /** Match against the path and its ancestors (true) or against each segment (false). */
  anchored: boolean
  /** A `!` pattern: a match un-marks the path instead of marking it. */
  negated: boolean
}

/** Normalise a repository-relative path: no leading `./` or `/`. */
function normalisePath(path: string): string {
  let normalised = path
  while (normalised.startsWith('./')) normalised = normalised.slice(2)
  return normalised.replace(/^\/+/, '')
}

/** Compile one raw pattern, or `null` when nothing remains after normalising. */
function compilePattern(raw: string): CompiledPattern | null {
  let pattern = raw.trim()
  if (pattern === '') return null

  let negated = false
  if (pattern.startsWith('!')) {
    negated = true
    pattern = pattern.slice(1).trim()
    if (pattern === '') return null
  }

  let anchored = false
  // `./x` is what shell completion produces at the repo root: anchor it.
  while (pattern.startsWith('./')) {
    anchored = true
    pattern = pattern.slice(2)
  }

  // gitignore's trailing slash ("directory only") - drop it; the ancestor
  // rule already makes a directory pattern cover everything beneath it.
  while (pattern.length > 1 && pattern.endsWith('/')) {
    pattern = pattern.slice(0, -1)
  }

  if (pattern.startsWith('/')) {
    anchored = true
    pattern = pattern.replace(/^\/+/, '')
  }
  if (pattern === '') return null
  if (pattern.includes('/')) anchored = true

  return { glob: compileGlob(pattern), anchored, negated }
}

function matchesCompiled(segments: string[], compiled: CompiledPattern): boolean {
  if (compiled.anchored) {
    // The path itself first, then each ancestor directory, longest first.
    for (let length = segments.length; length >= 1; length--) {
      if (compiled.glob(segments.slice(0, length).join('/'))) {
        return true
      }
    }
    return false
  }
  return segments.some((segment) => compiled.glob(segment))
}

/**
 * Build a matcher for a list of gitignore-style patterns. Compile once per
 * run and reuse it across every path in the diff.
 */
export function createPathMatcher(patterns: string[]): PathMatcher {
  const compiled = patterns.map(compilePattern).filter((entry): entry is CompiledPattern => entry !== null)
  if (compiled.length === 0) return () => false

  return (path: string): boolean => {
    const segments = normalisePath(path)
      .split('/')
      .filter((segment) => segment !== '')
    if (segments.length === 0) return false
    // gitignore semantics: the last pattern that matches decides.
    let verdict = false
    for (const entry of compiled) {
      if (matchesCompiled(segments, entry)) verdict = !entry.negated
    }
    return verdict
  }
}

/** Whether `path` matches any of the gitignore-style `patterns`. */
export function matchesPathPatterns(path: string, patterns: string[]): boolean {
  return createPathMatcher(patterns)(path)
}
