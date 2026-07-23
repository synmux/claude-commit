/**
 * Splitting a unified git diff into chunks that fit a character budget.
 *
 * The packer is structure-aware: it prefers to break on file boundaries, then
 * on hunk (`@@`) boundaries, and only falls back to raw line splitting for a
 * single hunk that is itself larger than the budget. When a file section is
 * split, its header (`diff --git ... / --- / +++`) is repeated at the top of
 * every piece so each chunk remains a self-contained, interpretable diff.
 */

import { estimateDiffTokens, isOpaqueLine } from "./tokens";

const FILE_HEADER = "diff --git ";
const HUNK_HEADER = "@@";

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
