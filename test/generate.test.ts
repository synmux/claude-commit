import { test, expect, describe } from "bun:test";
import { generateCommit } from "../src/generate";
import { DEFAULT_CONFIG } from "../src/config";
import { ClaudeCommitError } from "../src/errors";
import type { runPrompt } from "../src/agent";
import type { Config } from "../src/types";
import type { ModelResult } from "../src/types";

type Runner = typeof runPrompt;

const baseConfig: Config = { ...DEFAULT_CONFIG };

const armorLine = (index: number) =>
  `+${"Ab9Xy".repeat(13)}${String(index % 10).repeat(4)}`;

const armorDiff = (lines: number) =>
  [
    "diff --git a/secret.age b/secret.age",
    "index 111..222 100644",
    "--- a/secret.age",
    "+++ b/secret.age",
    `@@ -1,${lines} +1,${lines} @@`,
    ...Array.from({ length: lines }, (_, index) => armorLine(index)),
  ].join("\n");

const textDiff = `diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
 context
-old line
+new line`;

/**
 * Runner stub mirroring the real contract: summary calls (no outputFormat)
 * return text, final-stage structured calls return a schema-shaped message
 * list. `beforeCall` can throw to simulate backend rejections.
 */
function stubRunner(
  beforeCall?: (prompt: string, summaryCallIndex: number) => void,
): { runner: Runner; summaryPrompts: string[] } {
  const summaryPrompts: string[] = [];
  const runner: Runner = async (prompt, opts): Promise<ModelResult> => {
    if (opts.outputFormat) {
      return {
        text: "",
        costUsd: 0.001,
        structured: { messages: ["fix: stubbed message"] },
      };
    }
    beforeCall?.(prompt, summaryPrompts.length);
    summaryPrompts.push(prompt);
    return { text: `summary of ${prompt.length} chars`, costUsd: 0.002 };
  };
  return { runner, summaryPrompts };
}

const promptTooLong = () =>
  new ClaudeCommitError(
    "Failed to call the Claude Agent SDK: Claude Code returned an error " +
      "result: Prompt is too long · the request is ~1188235 tokens (limit 1000000)",
  );

describe("generateCommit", () => {
  test("small text diff: one summary, one final call, one message", async () => {
    const { runner, summaryPrompts } = stubRunner();
    const result = await generateCommit(textDiff, baseConfig, { runner });
    expect(result.messages).toEqual(["fix: stubbed message"]);
    expect(result.chunkCount).toBe(1);
    expect(result.summaries.length).toBe(1);
    expect(summaryPrompts[0]).toContain("old line");
    expect(result.costUsd).toBeCloseTo(0.003, 6);
  });

  test("armor-heavy diff is split by its dense token estimate", async () => {
    const { runner } = stubRunner();
    const config: Config = { ...baseConfig, maxChunkTokens: 40_000 };
    // ~1000 armor lines ≈ 71k chars ≈ 71k estimated tokens: needs >1 chunk
    // even though a chars/3.5 estimate (~20k) would call it a single chunk.
    const result = await generateCommit(armorDiff(1_000), config, { runner });
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(result.summaries.length).toBe(result.chunkCount);
  });

  test("a backend 'prompt is too long' rejection re-splits and retries", async () => {
    let rejected = false;
    const { runner, summaryPrompts } = stubRunner((_prompt, index) => {
      if (index === 0 && !rejected) {
        rejected = true;
        throw promptTooLong();
      }
    });
    // Fits the estimate as one chunk, but the (simulated) backend disagrees.
    const config: Config = { ...baseConfig, maxChunkTokens: 100_000 };
    const result = await generateCommit(armorDiff(1_000), config, { runner });
    expect(rejected).toBe(true);
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(result.messages).toEqual(["fix: stubbed message"]);
    // All content still reached the model across the retried pieces.
    expect(summaryPrompts.join("").includes(armorLine(0).slice(1))).toBe(true);
  });

  test("other model errors propagate unchanged", async () => {
    const boom = new ClaudeCommitError("Rate limited by the Claude API.");
    const { runner } = stubRunner(() => {
      throw boom;
    });
    await expect(generateCommit(textDiff, baseConfig, { runner })).rejects.toBe(
      boom,
    );
  });

  test("gives up re-splitting below the retry floor", async () => {
    const { runner } = stubRunner(() => {
      throw promptTooLong();
    });
    // Halving 15k lands below the 8k floor, so the rejection surfaces.
    const config: Config = { ...baseConfig, maxChunkTokens: 15_000 };
    await expect(
      generateCommit(armorDiff(100), config, { runner }),
    ).rejects.toThrow(/prompt is too long/i);
  });

  test("skipArmored redacts ciphertext before it reaches the model", async () => {
    const { runner, summaryPrompts } = stubRunner();
    const config: Config = { ...baseConfig, skipArmored: true };
    const result = await generateCommit(armorDiff(400), config, { runner });
    expect(result.chunkCount).toBe(1);
    expect(summaryPrompts[0]).toContain(
      "[cco: 400 armored/encoded lines omitted]",
    );
    expect(summaryPrompts[0]).not.toContain("Ab9Xy");
    expect(summaryPrompts[0]).toContain("a/secret.age");
  });
});
