import { test, expect, describe } from "bun:test";
import { redactOpaqueRuns, splitDiff, splitDiffToFit } from "../src/diff";
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
