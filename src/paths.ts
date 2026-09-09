/**
 * Path matching for the path-list configuration options - `lowPriorityPaths`
 * (weigh these changes less) and `ignore` (do not read these changes at all).
 * Both take the same pattern language, so both compile through here.
 *
 * Patterns follow gitignore conventions rather than raw glob semantics,
 * because that is what users reach for when they write
 * `.agents/skills/*-skilld` and expect it to cover every file beneath each
 * matching directory. `Bun.Glob` does the wildcard work (no dependency, `*`
 * matches dotfiles, `**` crosses directories, braces expand, `\` escapes);
 * this module adds the gitignore-style rules on top:
 *
 * - A pattern containing a `/` (anywhere but the end) is anchored at the
 *   repository root and matches a path when the glob matches the path
 *   itself **or any ancestor directory** of it.
 * - A pattern without a `/` matches when the glob matches **any path
 *   segment** - the file's basename or any ancestor directory's name - so
 *   `bun.lock` or `*-skilld` apply at any depth.
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
 * An ill-formed pattern never throws, but `Bun.Glob` parses it rather than
 * rejecting it, so it does not reliably match nothing: an unbalanced `{` is
 * treated as its first alternative (`{docs,build` matches `docs` at any
 * depth and never `build`), while an unterminated `[` matches nothing at
 * all, not even its own text (write `\[abc` for that). No construction-time
 * check can catch this - gitignore does not validate either - so the
 * failure mode is a silently mis-classified diff, made visible by the
 * `--verbose` match counts rather than prevented.
 */
import { Glob } from "bun";

/** A predicate over repository-relative paths. */
export type PathMatcher = (path: string) => boolean;

interface CompiledPattern {
  glob: Glob;
  /** Match against the path and its ancestors (true) or against each segment (false). */
  anchored: boolean;
  /** A `!` pattern: a match un-marks the path instead of marking it. */
  negated: boolean;
}

/** Normalise a repository-relative path: no leading `./` or `/`. */
function normalisePath(path: string): string {
  let normalised = path;
  while (normalised.startsWith("./")) normalised = normalised.slice(2);
  return normalised.replace(/^\/+/, "");
}

/** Compile one raw pattern, or `null` when nothing remains after normalising. */
function compilePattern(raw: string): CompiledPattern | null {
  let pattern = raw.trim();
  if (pattern === "") return null;

  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1).trim();
    if (pattern === "") return null;
  }

  let anchored = false;
  // `./x` is what shell completion produces at the repo root: anchor it.
  while (pattern.startsWith("./")) {
    anchored = true;
    pattern = pattern.slice(2);
  }

  // gitignore's trailing slash ("directory only") - drop it; the ancestor
  // rule already makes a directory pattern cover everything beneath it.
  while (pattern.length > 1 && pattern.endsWith("/")) {
    pattern = pattern.slice(0, -1);
  }

  if (pattern.startsWith("/")) {
    anchored = true;
    pattern = pattern.replace(/^\/+/, "");
  }
  if (pattern === "") return null;
  if (pattern.includes("/")) anchored = true;

  return { glob: new Glob(pattern), anchored, negated };
}

function matchesCompiled(
  segments: string[],
  compiled: CompiledPattern,
): boolean {
  if (compiled.anchored) {
    // The path itself first, then each ancestor directory, longest first.
    for (let length = segments.length; length >= 1; length--) {
      if (compiled.glob.match(segments.slice(0, length).join("/"))) {
        return true;
      }
    }
    return false;
  }
  return segments.some((segment) => compiled.glob.match(segment));
}

/**
 * Build a matcher for a list of gitignore-style patterns. Compile once per
 * run and reuse it across every path in the diff.
 */
export function createPathMatcher(patterns: string[]): PathMatcher {
  const compiled = patterns
    .map(compilePattern)
    .filter((entry): entry is CompiledPattern => entry !== null);
  if (compiled.length === 0) return () => false;

  return (path: string): boolean => {
    const segments = normalisePath(path)
      .split("/")
      .filter((segment) => segment !== "");
    if (segments.length === 0) return false;
    // gitignore semantics: the last pattern that matches decides.
    let verdict = false;
    for (const entry of compiled) {
      if (matchesCompiled(segments, entry)) verdict = !entry.negated;
    }
    return verdict;
  };
}

/** Whether `path` matches any of the gitignore-style `patterns`. */
export function matchesPathPatterns(path: string, patterns: string[]): boolean {
  return createPathMatcher(patterns)(path);
}
