import { test, expect, describe } from "bun:test";
import {
  partitionDiff,
  redactOpaqueRuns,
  sectionPaths,
  splitDiff,
  splitDiffToFit,
} from "../src/diff";
import { createLowPriorityMatcher } from "../src/paths";
import { estimateDiffTokens } from "../src/tokens";

const armorLine = (index: number) =>
  `+${"Ab9Xy".repeat(13)}${String(index % 10).repeat(4)}`;

const armorFile = (lines: number) =>
  [
    "diff --git a/secret.age b/secret.age",
    "index 111..222 100644",
    "--- a/secret.age",
    "+++ b/secret.age",
    `@@ -1,${lines} +1,${lines} @@`,
    ...Array.from({ length: lines }, (_, index) => armorLine(index)),
  ].join("\n");

const fileA = `diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
 context
-old line
+new line`;

const fileB = `diff --git a/b.txt b/b.txt
index 333..444 100644
--- a/b.txt
+++ b/b.txt
@@ -1,1 +1,1 @@
-bee
+honey`;

describe("splitDiff", () => {
  test("empty diff yields no chunks", () => {
    expect(splitDiff("", 1000)).toEqual([]);
    expect(splitDiff("   \n  ", 1000)).toEqual([]);
  });

  test("small diff fits in a single chunk", () => {
    const diff = `${fileA}\n${fileB}`;
    expect(splitDiff(diff, 100_000)).toEqual([diff]);
  });

  test("splits on file boundaries when over budget", () => {
    const diff = `${fileA}\n${fileB}`;
    // Budget large enough for one file but not both.
    const chunks = splitDiff(diff, fileA.length + 5);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain("a/a.txt");
    expect(chunks[1]).toContain("a/b.txt");
    // No content is lost.
    expect(chunks.join("\n").replace(/\n/g, "")).toBe(diff.replace(/\n/g, ""));
  });

  test("every chunk stays within the budget (except unsplittable atoms)", () => {
    const many = Array.from(
      { length: 20 },
      (_, i) =>
        `diff --git a/f${i}.txt b/f${i}.txt
index a..b 100644
--- a/f${i}.txt
+++ b/f${i}.txt
@@ -1,1 +1,1 @@
-v${i}
+w${i}`,
    ).join("\n");
    const budget = 200;
    const chunks = splitDiff(many, budget);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(budget);
    }
  });

  test("splits a single large file on hunk boundaries, repeating the header", () => {
    const header = `diff --git a/big.txt b/big.txt
index aaa..bbb 100644
--- a/big.txt
+++ b/big.txt`;
    const hunks = Array.from(
      { length: 6 },
      (_, i) => `@@ -${i},1 +${i},1 @@\n-line ${i} old\n+line ${i} new`,
    );
    const diff = `${header}\n${hunks.join("\n")}`;
    const budget = header.length + 80;
    const chunks = splitDiff(diff, budget);

    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk repeats the file header so it is self-contained.
    for (const chunk of chunks) {
      expect(chunk.startsWith("diff --git a/big.txt")).toBe(true);
      expect(chunk).toContain("+++ b/big.txt");
    }
    // All hunk markers survive somewhere.
    for (let i = 0; i < hunks.length; i++) {
      expect(chunks.some((c) => c.includes(`-${i},1 +${i},1`))).toBe(true);
    }
  });

  test("hard-splits a single hunk larger than the budget", () => {
    const header = `diff --git a/huge.txt b/huge.txt
--- a/huge.txt
+++ b/huge.txt`;
    const bigHunk =
      `@@ -1,100 +1,100 @@\n` +
      Array.from(
        { length: 100 },
        (_, i) => `+a very long added line number ${i}`,
      ).join("\n");
    const diff = `${header}\n${bigHunk}`;
    const budget = header.length + 120;
    const chunks = splitDiff(diff, budget);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(budget);
    }
  });

  test("keeps an unsplittable binary section whole even if oversized", () => {
    const binary = `diff --git a/img.png b/img.png
index 000..fff 100644
Binary files a/img.png and b/img.png differ`;
    const chunks = splitDiff(binary, 10);
    expect(chunks).toEqual([binary]);
  });

  test("does not explode into tiny pieces when the budget is pathologically small", () => {
    const header = `diff --git a/x.txt b/x.txt
--- a/x.txt
+++ b/x.txt`;
    const hunk =
      "@@ -1,50 +1,50 @@\n" +
      Array.from({ length: 50 }, (_, i) => `+line ${i}`).join("\n");
    const diff = `${header}\n${hunk}`;
    // Budget smaller than the header itself - splitting per-line would otherwise
    // shatter the hunk into ~one fragment per character.
    const chunks = splitDiff(diff, 10);
    expect(chunks).toEqual([diff]);
  });
});

describe("splitDiffToFit", () => {
  test("keeps a small text diff as a single chunk", () => {
    const diff = `${fileA}\n${fileB}`;
    expect(splitDiffToFit(diff, 10_000, 3.5)).toEqual([diff]);
  });

  test("splits armor by its real (dense) token estimate", () => {
    const diff = armorFile(100); // ~7.2k chars, ~7.2k tokens at 1 char/token
    const chunks = splitDiffToFit(diff, 1_500, 3.5);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(estimateDiffTokens(chunk, 3.5)).toBeLessThanOrEqual(1_500);
      // Every piece keeps a self-contained file header.
      expect(chunk).toContain("a/secret.age");
    }
    // No armor line is lost across the split.
    const armorCount = chunks
      .join("\n")
      .split("\n")
      .filter((line) => line.includes("Ab9Xy")).length;
    expect(armorCount).toBe(100);
  });

  test("re-splits only the dense region of a mixed diff", () => {
    const diff = `${fileA}\n${armorFile(100)}`;
    const chunks = splitDiffToFit(diff, 1_500, 3.5);
    for (const chunk of chunks) {
      expect(estimateDiffTokens(chunk, 3.5)).toBeLessThanOrEqual(1_500);
    }
    // The plain-text file survives intact in exactly one chunk.
    expect(chunks.filter((chunk) => chunk.includes("a/a.txt")).length).toBe(1);
  });

  test("keeps an unsplittable oversized section whole for the runtime backstop", () => {
    // No @@ hunks to split on - e.g. a git binary patch body.
    const binary = [
      "diff --git a/blob.bin b/blob.bin",
      "GIT binary patch",
      "literal 4000",
      ...Array.from(
        { length: 60 },
        (_, i) => `z${"Xy4Qk".repeat(12)}${i % 10}`,
      ),
    ].join("\n");
    expect(splitDiffToFit(binary, 100, 3.5)).toEqual([binary]);
  });
});

describe("redactOpaqueRuns", () => {
  test("replaces an armor run with a counting marker and keeps structure", () => {
    const redacted = redactOpaqueRuns(armorFile(50));
    expect(redacted).toContain("[cco: 50 armored/encoded lines omitted]");
    expect(redacted).toContain("diff --git a/secret.age b/secret.age");
    expect(redacted).toContain("@@ -1,50 +1,50 @@");
    expect(redacted).not.toContain("Ab9Xy");
  });

  test("keeps runs shorter than three lines (a lone URL or hash is content)", () => {
    const diff = `${fileA}\n+https://example.com/some/rather/long/path/that/matters?token=abcdef`;
    expect(redactOpaqueRuns(diff)).toBe(diff);
  });

  test("leaves plain text diffs untouched", () => {
    const diff = `${fileA}\n${fileB}`;
    expect(redactOpaqueRuns(diff)).toBe(diff);
  });

  test("shrinks an armor-heavy diff below any real budget", () => {
    const redacted = redactOpaqueRuns(armorFile(5_000));
    expect(estimateDiffTokens(redacted, 3.5)).toBeLessThan(200);
  });
});

describe("sectionPaths", () => {
  test("reads the source and destination of a modified file", () => {
    expect(sectionPaths(fileA)).toEqual(["a.txt"]);
  });

  test("skips /dev/null for added and deleted files", () => {
    const added = [
      "diff --git a/added.txt b/added.txt",
      "new file mode 100644",
      "index 0000000..a702f6c",
      "--- /dev/null",
      "+++ b/added.txt",
      "@@ -0,0 +1 @@",
      "+brand",
    ].join("\n");
    const deleted = [
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      "index 286c5f5..0000000",
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-gone",
    ].join("\n");
    expect(sectionPaths(added)).toEqual(["added.txt"]);
    expect(sectionPaths(deleted)).toEqual(["gone.txt"]);
  });

  test("reports both sides of a rename", () => {
    const rename = [
      "diff --git a/dir/old.txt b/dir/new.txt",
      "similarity index 100%",
      "rename from dir/old.txt",
      "rename to dir/new.txt",
    ].join("\n");
    expect(sectionPaths(rename)).toEqual(["dir/old.txt", "dir/new.txt"]);
  });

  test("reports both sides of a copy", () => {
    const copy = [
      "diff --git a/src/a.ts b/src/b.ts",
      "similarity index 100%",
      "copy from src/a.ts",
      "copy to src/b.ts",
    ].join("\n");
    expect(sectionPaths(copy)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("falls back to the header for binary and mode-only sections", () => {
    const binary = [
      "diff --git a/img.png b/img.png",
      "index a6a3e7f..1d518ed 100644",
      "Binary files a/img.png and b/img.png differ",
    ].join("\n");
    const mode = [
      "diff --git a/mode.sh b/mode.sh",
      "old mode 100644",
      "new mode 100755",
    ].join("\n");
    expect(sectionPaths(binary)).toEqual(["img.png"]);
    expect(sectionPaths(mode)).toEqual(["mode.sh"]);
  });

  test("strips the tab git appends after a path containing spaces", () => {
    const spaced = [
      "diff --git a/my file.txt b/my file.txt",
      "index 5626abf..814f4a4 100644",
      "--- a/my file.txt\t",
      "+++ b/my file.txt\t",
      "@@ -1 +1,2 @@",
      " one",
      "+two",
    ].join("\n");
    expect(sectionPaths(spaced)).toEqual(["my file.txt"]);
  });

  test("resolves a header whose path itself contains ' b/'", () => {
    const tricky = [
      "diff --git a/sub b/file.txt b/sub b/file.txt",
      "old mode 100644",
      "new mode 100755",
    ].join("\n");
    expect(sectionPaths(tricky)).toEqual(["sub b/file.txt"]);
  });

  test("unquotes C-style quoted paths, including octal UTF-8 escapes", () => {
    const quoted = [
      'diff --git "a/quo\\"te.txt" "b/quo\\"te.txt"',
      "index bca70f3..45279bd 100644",
      '--- "a/quo\\"te.txt"',
      '+++ "b/quo\\"te.txt"',
      "@@ -1 +1,2 @@",
      " q",
      "+qq",
    ].join("\n");
    const unicode = [
      'diff --git "a/\\303\\274n\\303\\257code.txt" "b/\\303\\274n\\303\\257code.txt"',
      "index 4ae8ef0..fe57971 100644",
      '--- "a/\\303\\274n\\303\\257code.txt"',
      '+++ "b/\\303\\274n\\303\\257code.txt"',
      "@@ -1 +1,2 @@",
      " u",
      "+uu",
    ].join("\n");
    const quotedMode = [
      'diff --git "a/tab\\there.txt" "b/tab\\there.txt"',
      "old mode 100644",
      "new mode 100755",
    ].join("\n");
    expect(sectionPaths(quoted)).toEqual(['quo"te.txt']);
    expect(sectionPaths(unicode)).toEqual(["ünïcode.txt"]);
    expect(sectionPaths(quotedMode)).toEqual(["tab\there.txt"]);
  });

  test("tolerates diffs generated without the a/ b/ prefixes", () => {
    const noPrefix = [
      "diff --git added.txt added.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ added.txt",
      "@@ -0,0 +1 @@",
      "+brand",
    ].join("\n");
    expect(sectionPaths(noPrefix)).toEqual(["added.txt"]);
  });

  test("ignores '---' and '+++' lines inside hunk bodies", () => {
    const tricky = [
      "diff --git a/notes.md b/notes.md",
      "index 111..222 100644",
      "--- a/notes.md",
      "+++ b/notes.md",
      "@@ -1,2 +1,2 @@",
      "--- a/looks-like-a-header.txt",
      "+++ b/also-looks-like-one.txt",
    ].join("\n");
    expect(sectionPaths(tricky)).toEqual(["notes.md"]);
  });

  test("returns nothing for a preamble without a file header", () => {
    expect(sectionPaths("* Unmerged path foo.txt")).toEqual([]);
  });
});

describe("partitionDiff", () => {
  const never = () => false;
  const lowFor =
    (...paths: string[]) =>
    (path: string) =>
      paths.includes(path);

  test("with a matcher that matches nothing, everything is primary", () => {
    const diff = `${fileA}\n${fileB}`;
    expect(partitionDiff(diff, never)).toEqual({
      primary: diff,
      lowPriority: "",
      matchedFiles: 0,
      totalFiles: 2,
      promoted: false,
    });
  });

  test("counts the file sections that matched", () => {
    const diff = `${fileA}\n${fileB}`;
    expect(partitionDiff(diff, lowFor("b.txt"))).toMatchObject({
      matchedFiles: 1,
      totalFiles: 2,
      promoted: false,
    });
  });

  test("sorts file sections by whether their paths match, preserving content", () => {
    const diff = `${fileA}\n${fileB}\n`;
    const { primary, lowPriority } = partitionDiff(diff, lowFor("b.txt"));
    expect(primary).toBe(fileA);
    expect(lowPriority).toBe(`${fileB}\n`);
  });

  test("keeps the original order within each partition", () => {
    const fileC = fileB.replace(/b\.txt/g, "c.txt");
    const diff = `${fileB}\n${fileA}\n${fileC}`;
    const { primary, lowPriority } = partitionDiff(
      diff,
      lowFor("b.txt", "c.txt"),
    );
    expect(primary).toBe(fileA);
    expect(lowPriority).toBe(`${fileB}\n${fileC}`);
  });

  test("promotes the low-priority partition when nothing else changed", () => {
    const diff = `${fileA}\n${fileB}`;
    expect(partitionDiff(diff, lowFor("a.txt", "b.txt"))).toEqual({
      primary: diff,
      lowPriority: "",
      matchedFiles: 2,
      totalFiles: 2,
      promoted: true,
    });
  });

  test("a negated pattern keeps a file in the primary partition", () => {
    const matcher = createLowPriorityMatcher(["*.txt", "!a.txt"]);
    const diff = `${fileA}\n${fileB}`;
    expect(partitionDiff(diff, matcher)).toMatchObject({
      primary: fileA,
      lowPriority: fileB,
      matchedFiles: 1,
      totalFiles: 2,
    });
  });

  test("a rename is low priority only when both sides match", () => {
    const rename = [
      "diff --git a/dist/old.js b/src/new.js",
      "similarity index 100%",
      "rename from dist/old.js",
      "rename to src/new.js",
    ].join("\n");
    const diff = `${fileA}\n${rename}`;
    expect(partitionDiff(diff, lowFor("dist/old.js")).lowPriority).toBe("");
    expect(
      partitionDiff(diff, lowFor("dist/old.js", "src/new.js")).lowPriority,
    ).toBe(rename);
  });

  test("a section with no recognisable path stays primary and is not counted as a file", () => {
    const preamble = "* Unmerged path weird.txt";
    const diff = `${preamble}\n${fileB}`;
    const partition = partitionDiff(diff, () => true);
    // Everything matched except the preamble, so the preamble is the only
    // primary content and fileB is genuinely low priority.
    expect(partition.primary).toBe(preamble);
    expect(partition.lowPriority).toBe(fileB);
    expect(partition.totalFiles).toBe(1);
    expect(partition.matchedFiles).toBe(1);
  });

  test("an empty diff yields two empty partitions", () => {
    expect(partitionDiff("", never)).toEqual({
      primary: "",
      lowPriority: "",
      matchedFiles: 0,
      totalFiles: 0,
      promoted: false,
    });
  });
});
