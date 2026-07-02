import { test, expect, describe } from "bun:test";
import { splitDiff } from "../src/diff";

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
