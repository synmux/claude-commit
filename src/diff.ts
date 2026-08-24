/**
 * Splitting a unified git diff into chunks that fit a character budget, and
 * partitioning it by path priority.
 *
 * The packer is structure-aware: it prefers to break on file boundaries, then
 * on hunk (`@@`) boundaries, and only falls back to raw line splitting for a
 * single hunk that is itself larger than the budget. When a file section is
 * split, its header (`diff --git ... / --- / +++`) is repeated at the top of
 * every piece so each chunk remains a self-contained, interpretable diff.
 *
 * `partitionDiff` sorts whole file sections into a primary and a low-priority
 * diff (see `lowPriorityPaths` in the config) using the paths `sectionPaths`
 * recovers from each section's header lines.
 */

import type { PathMatcher } from "./paths";
import { estimateDiffTokens, isOpaqueLine } from "./tokens";

const FILE_HEADER = "diff --git ";
const HUNK_HEADER = "@@";
const DEV_NULL = "/dev/null";
const SOURCE_PREFIX = "a/";
const DESTINATION_PREFIX = "b/";

/**
 * Minimum per-piece character budget (after the repeated file header) below
 * which we stop trying to subdivide a section. This guards against a
 * misconfigured tiny `maxChars`, or a pathologically large file header,
 * driving the line-splitter's budget to zero and shattering a hunk into
 * one-character pieces - which would otherwise spawn a model request per
 * character.
 */
const MIN_SPLIT_BUDGET = 64;

/** Split a full diff into per-file sections. */
function splitFileSections(diff: string): string[] {
  const lines = diff.split("\n");
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith(FILE_HEADER) && current.length > 0) {
      sections.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current.join("\n"));
  return sections;
}

/** Group the body of a file section (from the first `@@`) into hunks. */
function groupHunks(bodyLines: string[]): string[] {
  const hunks: string[] = [];
  let current: string[] = [];
  for (const line of bodyLines) {
    if (line.startsWith(HUNK_HEADER) && current.length > 0) {
      hunks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) hunks.push(current.join("\n"));
  return hunks;
}

/** Break a string into pieces of at most `maxLen` characters, preferring line boundaries. */
function breakByLines(text: string, maxLen: number): string[] {
  const limit = Math.max(1, maxLen);
  const lines = text.split("\n");
  const pieces: string[] = [];
  let current = "";
  for (const line of lines) {
    const addition = current === "" ? line.length : line.length + 1;
    if (current !== "" && current.length + addition > limit) {
      pieces.push(current);
      current = "";
    }
    if (line.length > limit) {
      // A single line longer than the budget: hard-split it.
      if (current !== "") {
        pieces.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += limit) {
        pieces.push(line.slice(i, i + limit));
      }
    } else {
      current = current === "" ? line : current + "\n" + line;
    }
  }
  if (current !== "") pieces.push(current);
  return pieces;
}

/** Break an oversized file section into units that each fit `maxChars`. */
function breakSection(section: string, maxChars: number): string[] {
  if (section.length <= maxChars) return [section];

  const lines = section.split("\n");
  const firstHunk = lines.findIndex((l) => l.startsWith(HUNK_HEADER));
  if (firstHunk === -1) {
    // No hunks to split on (binary patch, pure rename, mode change): keep whole.
    return [section];
  }

  const header = lines.slice(0, firstHunk).join("\n");
  const headerLen = header.length + 1; // account for the joining newline

  // If there isn't room for a meaningful piece after repeating the header,
  // keep the section whole rather than exploding it into tiny fragments.
  if (maxChars - headerLen < MIN_SPLIT_BUDGET) return [section];

  const hunks = groupHunks(lines.slice(firstHunk));
  const units: string[] = [];

  for (const hunk of hunks) {
    if (headerLen + hunk.length <= maxChars) {
      units.push(header + "\n" + hunk);
    } else {
      for (const piece of breakByLines(hunk, maxChars - headerLen)) {
        units.push(header + "\n" + piece);
      }
    }
  }
  return units;
}

/** Greedily pack pre-fitted units into as few chunks as possible. */
function packUnits(units: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current === "") {
      current = unit;
      continue;
    }
    if (current.length + 1 + unit.length <= maxChars) {
      current = current + "\n" + unit;
    } else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

/**
 * Split a unified diff into chunks no larger than `maxChars` characters.
 *
 * Returns an empty array for an empty diff, and a single-element array when the
 * whole diff already fits.
 */
export function splitDiff(diff: string, maxChars: number): string[] {
  if (diff.trim() === "") return [];
  if (diff.length <= maxChars) return [diff];

  const units: string[] = [];
  for (const section of splitFileSections(diff)) {
    units.push(...breakSection(section, maxChars));
  }
  return packUnits(units, maxChars);
}

/** Character budget for `text` such that its classified token estimate fits `maxTokens`. */
function charBudgetFor(
  text: string,
  maxTokens: number,
  charsPerToken: number,
): number {
  const density =
    text.length / Math.max(1, estimateDiffTokens(text, charsPerToken));
  return Math.max(1, Math.floor(maxTokens * density));
}

/**
 * Minimum consecutive opaque lines before a run is redacted. A lone long
 * unbroken line (a URL, a hash pin, a long path) can carry real meaning; an
 * armored blob never arrives alone.
 */
const MIN_REDACT_RUN = 3;

/**
 * Replace each run of opaque (armored/encoded) lines with a single marker
 * line. The marker keeps the surrounding diff structure interpretable and
 * tells the summary model what was elided, so it can still report that an
 * encrypted file changed - without paying ~1 token per character to send
 * ciphertext the model cannot read anyway.
 */
export function redactOpaqueRuns(diff: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= MIN_REDACT_RUN) {
      out.push(`[cco: ${run.length} armored/encoded lines omitted]`);
    } else {
      out.push(...run);
    }
    run = [];
  };
  for (const line of diff.split("\n")) {
    if (isOpaqueLine(line)) {
      run.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}

/**
 * The staged diff split by path priority. `primary` drives the commit
 * message; `lowPriority` holds the sections whose every path matched a
 * `lowPriorityPaths` pattern. Either may be `""`. The counts make the
 * matcher observable (`--verbose`): a pattern that matches nothing and one
 * that matches everything (and is therefore promoted) produce the same
 * message otherwise.
 */
export interface DiffPartition {
  primary: string;
  lowPriority: string;
  /** File sections whose paths all matched. */
  matchedFiles: number;
  /** File sections with at least one recognisable path. */
  totalFiles: number;
  /** Every file matched, so the low-priority sections were promoted to primary. */
  promoted: boolean;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Single-character C escapes git emits inside a quoted path, mapped to their byte. */
const SIMPLE_ESCAPES: Record<string, number> = {
  a: 0x07,
  b: 0x08,
  t: 0x09,
  n: 0x0a,
  v: 0x0b,
  f: 0x0c,
  r: 0x0d,
  "\\": 0x5c,
  '"': 0x22,
};

/**
 * Undo git's C-style path quoting (`core.quotepath`): a path containing
 * quotes, backslashes, control characters or - by default - any non-ASCII
 * byte is emitted as `"..."` with `\"`, `\\`, `\t`-style escapes and
 * `\NNN` octal escapes for raw bytes. Escapes are decoded to bytes and the
 * result is read back as UTF-8, so `"\303\274"` becomes `ü`. Unquoted
 * input is returned as-is.
 */
function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
    return raw;
  }
  const inner = raw.slice(1, -1);
  const bytes: number[] = [];
  let index = 0;
  while (index < inner.length) {
    if (inner[index] !== "\\") {
      // Copy one code point (possibly a surrogate pair) as UTF-8 bytes.
      const literal = String.fromCodePoint(inner.codePointAt(index)!);
      bytes.push(...textEncoder.encode(literal));
      index += literal.length;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(inner.slice(index + 1, index + 4));
    if (octal) {
      bytes.push(parseInt(octal[0], 8) & 0xff);
      index += 1 + octal[0].length;
      continue;
    }
    const escaped = inner[index + 1];
    if (escaped === undefined) break; // dangling backslash: drop it
    const simple = SIMPLE_ESCAPES[escaped];
    if (simple !== undefined) {
      bytes.push(simple);
    } else {
      bytes.push(...textEncoder.encode(escaped)); // unknown escape: literal
    }
    index += 2;
  }
  return textDecoder.decode(Uint8Array.from(bytes));
}

/** Drop a `a/` or `b/` prefix when present (diffs made with `--no-prefix` lack it). */
function stripDiffPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * The path named by a `--- `/`+++ ` marker line, or `null` for `/dev/null`.
 * Git appends a tab after an unquoted path that contains spaces, so that is
 * removed before unquoting.
 */
function pathFromMarkerLine(rest: string, prefix: string): string | null {
  const unquoted = unquoteGitPath(
    rest.endsWith("\t") ? rest.slice(0, -1) : rest,
  );
  if (unquoted === DEV_NULL) return null;
  return stripDiffPrefix(unquoted, prefix);
}

/**
 * Read a quoted token starting at `start` (which must be a `"`), returning
 * the token including its quotes and the index just past it, or `null` if
 * the closing quote is missing.
 */
function readQuotedToken(
  text: string,
  start: number,
): { token: string; end: number } | null {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === '"') {
      return { token: text.slice(start, index + 1), end: index + 1 };
    }
    index += 1;
  }
  return null;
}

/**
 * The source and destination paths of a `diff --git a/X b/Y` header line,
 * for sections that carry no `---`/`+++`/`rename`/`copy` lines (binary
 * patches, mode-only changes). Git separates the two paths with a single
 * space and quotes only the ones that need it, so an unquoted path
 * containing a space - or even ` b/` - is ambiguous; for such sections git
 * always writes the same path twice, so the split is validated by checking
 * that both halves agree, falling back to the last ` b/` for a rename-style
 * header.
 */
function pathsFromHeader(headerLine: string): string[] {
  const rest = headerLine.slice(FILE_HEADER.length);
  let source: string | undefined;
  let destination: string | undefined;

  if (rest.startsWith('"')) {
    const first = readQuotedToken(rest, 0);
    if (first) {
      source = unquoteGitPath(first.token);
      const remainder = rest.slice(first.end).replace(/^ /, "");
      destination = unquoteGitPath(remainder);
    }
  } else if (rest.endsWith('"')) {
    const quoteStart = rest.indexOf(' "');
    if (quoteStart !== -1) {
      source = rest.slice(0, quoteStart);
      destination = unquoteGitPath(rest.slice(quoteStart + 1));
    }
  } else if (rest.length % 2 === 1) {
    const half = (rest.length - 1) / 2;
    const left = rest.slice(0, half);
    const right = rest.slice(half + 1);
    if (
      rest[half] === " " &&
      stripDiffPrefix(left, SOURCE_PREFIX) ===
        stripDiffPrefix(right, DESTINATION_PREFIX)
    ) {
      source = left;
      destination = right;
    }
  }

  if (source === undefined || destination === undefined) {
    const split = rest.lastIndexOf(` ${DESTINATION_PREFIX}`);
    if (split === -1) return [];
    source = rest.slice(0, split);
    destination = rest.slice(split + 1);
  }

  const paths = [
    stripDiffPrefix(source, SOURCE_PREFIX),
    stripDiffPrefix(destination, DESTINATION_PREFIX),
  ].filter((path) => path !== "");
  return paths.filter((path, index) => paths.indexOf(path) === index);
}

/**
 * The repository-relative paths a file section touches: one for an ordinary
 * change, two for a rename or copy. Paths are read from the `---`/`+++`
 * marker lines and `rename`/`copy from`/`to` lines in the section header
 * (before the first hunk, so a removed line that happens to start with
 * `-- ` is never mistaken for a marker), falling back to the
 * `diff --git a/X b/Y` line for sections that have none. Returns `[]` for
 * content that is not a file section at all.
 */
export function sectionPaths(section: string): string[] {
  const lines = section.split("\n");
  const firstHunk = lines.findIndex((line) => line.startsWith(HUNK_HEADER));
  const headerLines = firstHunk === -1 ? lines : lines.slice(0, firstHunk);

  const paths: string[] = [];
  const add = (path: string | null) => {
    if (path !== null && path !== "" && !paths.includes(path)) {
      paths.push(path);
    }
  };
  for (const line of headerLines) {
    if (line.startsWith("--- ")) {
      add(pathFromMarkerLine(line.slice(4), SOURCE_PREFIX));
    } else if (line.startsWith("+++ ")) {
      add(pathFromMarkerLine(line.slice(4), DESTINATION_PREFIX));
    } else if (line.startsWith("rename from ")) {
      add(unquoteGitPath(line.slice("rename from ".length)));
    } else if (line.startsWith("rename to ")) {
      add(unquoteGitPath(line.slice("rename to ".length)));
    } else if (line.startsWith("copy from ")) {
      add(unquoteGitPath(line.slice("copy from ".length)));
    } else if (line.startsWith("copy to ")) {
      add(unquoteGitPath(line.slice("copy to ".length)));
    }
  }
  if (paths.length > 0) return paths;

  const header = lines[0];
  return header !== undefined && header.startsWith(FILE_HEADER)
    ? pathsFromHeader(header)
    : [];
}

/**
 * Sort a diff's file sections into a primary and a low-priority diff.
 *
 * A section is low priority only when it names at least one path and every
 * path it names matches - so a rename into or out of a low-priority area
 * stays primary, as does anything whose path cannot be recognised. Sections
 * keep their original order within each partition and are joined back with
 * newlines, so each partition is itself a valid unified diff.
 *
 * When nothing is primary, the low-priority sections are promoted: with no
 * other change to yield to, they *are* the change and should be described
 * in full, exactly as if no patterns were configured.
 */
export function partitionDiff(
  diff: string,
  isLowPriority: PathMatcher,
): DiffPartition {
  const empty: DiffPartition = {
    primary: "",
    lowPriority: "",
    matchedFiles: 0,
    totalFiles: 0,
    promoted: false,
  };
  if (diff === "") return empty;

  const primary: string[] = [];
  const lowPriority: string[] = [];
  let totalFiles = 0;
  for (const section of splitFileSections(diff)) {
    const paths = sectionPaths(section);
    if (paths.length > 0) totalFiles += 1;
    const deprioritised = paths.length > 0 && paths.every(isLowPriority);
    (deprioritised ? lowPriority : primary).push(section);
  }
  const matchedFiles = lowPriority.length;

  if (primary.length === 0) {
    return {
      ...empty,
      primary: lowPriority.join("\n"),
      matchedFiles,
      totalFiles,
      promoted: matchedFiles > 0,
    };
  }
  return {
    primary: primary.join("\n"),
    lowPriority: lowPriority.join("\n"),
    matchedFiles,
    totalFiles,
    promoted: false,
  };
}

/**
 * Split a diff so that every chunk's *classified token estimate* fits
 * `maxTokens`.
 *
 * `splitDiff` budgets in characters, but token density varies wildly by
 * content: prose and code sit near the configured `charsPerToken` (~3.5)
 * while base64/armor lines measure near 1 char/token. Sizing every chunk
 * with one blended ratio lets an armor-heavy region overflow, so after an
 * initial blended-density split, any chunk still over budget is re-split
 * using its own (denser) ratio until everything fits or no further split is
 * possible. An unsplittable oversized chunk is kept - the overflow retry in
 * the generation pipeline is the backstop for that case.
 */
export function splitDiffToFit(
  diff: string,
  maxTokens: number,
  charsPerToken: number,
): string[] {
  const queue = splitDiff(diff, charBudgetFor(diff, maxTokens, charsPerToken));
  const fitted: string[] = [];
  while (queue.length > 0) {
    const chunk = queue.shift()!;
    if (estimateDiffTokens(chunk, charsPerToken) <= maxTokens) {
      fitted.push(chunk);
      continue;
    }
    // Over budget: the chunk's own density is at least as dense as the
    // blend it was sized with, so this budget is strictly smaller than the
    // chunk - splitDiff will attempt a real split.
    const pieces = splitDiff(
      chunk,
      charBudgetFor(chunk, maxTokens, charsPerToken),
    );
    if (pieces.length <= 1) {
      fitted.push(chunk);
      continue;
    }
    queue.unshift(...pieces);
  }
  return fitted;
}
