/**
 * Splitting a unified git diff into chunks that fit a character budget.
 *
 * The packer is structure-aware: it prefers to break on file boundaries, then
 * on hunk (`@@`) boundaries, and only falls back to raw line splitting for a
 * single hunk that is itself larger than the budget. When a file section is
 * split, its header (`diff --git ... / --- / +++`) is repeated at the top of
 * every piece so each chunk remains a self-contained, interpretable diff.
 */

const FILE_HEADER = "diff --git ";
const HUNK_HEADER = "@@";

/**
 * Minimum per-piece character budget (after the repeated file header) below
 * which we stop trying to subdivide a section. This guards against a
 * misconfigured tiny `maxChars`, or a pathologically large file header,
 * driving the line-splitter's budget to zero and shattering a hunk into
 * one-character pieces — which would otherwise spawn a model request per
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
