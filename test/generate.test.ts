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

/** One summary-stage request as seen by the stub runner. */
interface SummaryCall {
  prompt: string;
  system: string;
}

/**
 * Runner stub mirroring the real contract: summary calls (no outputFormat)
 * return text, final-stage structured calls return a schema-shaped message
 * list. `beforeCall` can throw to simulate backend rejections. Every
 * summary request is recorded (prompt and system prompt) along with the
 * final-stage prompt, so tests can assert on what reached each stage.
 */
function stubRunner(
  beforeCall?: (prompt: string, summaryCallIndex: number) => void,
): {
  runner: Runner;
  summaryPrompts: string[];
  summaryCalls: SummaryCall[];
  finalPrompts: string[];
} {
  const summaryPrompts: string[] = [];
  const summaryCalls: SummaryCall[] = [];
  const finalPrompts: string[] = [];
  const runner: Runner = async (prompt, opts): Promise<ModelResult> => {
    if (opts.outputFormat) {
      finalPrompts.push(prompt);
      return {
        text: "",
        costUsd: 0.001,
        structured: { messages: ["fix: stubbed message"] },
      };
    }
    beforeCall?.(prompt, summaryPrompts.length);
    summaryPrompts.push(prompt);
    summaryCalls.push({ prompt, system: opts.system });
    return { text: `summary of ${prompt.length} chars`, costUsd: 0.002 };
  };
  return { runner, summaryPrompts, summaryCalls, finalPrompts };
}

const LOW_PRIORITY_SYSTEM = /low[- ]priority/i;

/** A generated skill doc under the path this repo deprioritises. */
const skillDiff = [
  "diff --git a/.agents/skills/ora-skilld/SKILL.md b/.agents/skills/ora-skilld/SKILL.md",
  "index 111..222 100644",
  "--- a/.agents/skills/ora-skilld/SKILL.md",
  "+++ b/.agents/skills/ora-skilld/SKILL.md",
  "@@ -1,2 +1,2 @@",
  " # ora",
  "-generated 2026-07-01",
  "+generated 2026-08-24",
].join("\n");

const lowPriorityConfig: Config = {
  ...baseConfig,
  lowPriorityPaths: [".agents/skills/*-skilld", "*.age"],
};

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

  test("summaries are tagged primary when no low-priority paths are configured", async () => {
    const { runner, summaryCalls } = stubRunner();
    const result = await generateCommit(
      `${textDiff}\n${skillDiff}`,
      baseConfig,
      { runner },
    );
    expect(result.summaries.map((summary) => summary.priority)).toEqual([
      "primary",
    ]);
    expect(summaryCalls[0]!.prompt).toContain("old line");
    expect(summaryCalls[0]!.prompt).toContain("generated 2026-08-24");
    expect(summaryCalls[0]!.system).not.toMatch(LOW_PRIORITY_SYSTEM);
  });

  test("low-priority sections are summarised separately, after the primary ones, with their own prompt", async () => {
    const { runner, summaryCalls, finalPrompts } = stubRunner();
    const result = await generateCommit(
      `${skillDiff}\n${textDiff}`,
      lowPriorityConfig,
      { runner },
    );

    expect(summaryCalls.length).toBe(2);
    const [primaryCall, lowCall] = summaryCalls as [SummaryCall, SummaryCall];
    // Primary first, even though the skill doc came first in the diff.
    expect(primaryCall.prompt).toContain("old line");
    expect(primaryCall.prompt).not.toContain("SKILL.md");
    expect(primaryCall.system).not.toMatch(LOW_PRIORITY_SYSTEM);
    expect(lowCall.prompt).toContain("SKILL.md");
    expect(lowCall.prompt).not.toContain("old line");
    expect(lowCall.prompt).toMatch(LOW_PRIORITY_SYSTEM);
    expect(lowCall.system).toMatch(LOW_PRIORITY_SYSTEM);

    expect(result.summaries.map((summary) => summary.priority)).toEqual([
      "primary",
      "low",
    ]);
    expect(result.chunkCount).toBe(2);
    expect(finalPrompts[0]).toContain("Primary changes");
    expect(finalPrompts[0]).toContain("Low-priority changes");
  });

  test("a diff made only of low-priority paths is promoted and treated as primary", async () => {
    const { runner, summaryCalls, finalPrompts } = stubRunner();
    const result = await generateCommit(skillDiff, lowPriorityConfig, {
      runner,
    });
    expect(summaryCalls.length).toBe(1);
    expect(summaryCalls[0]!.system).not.toMatch(LOW_PRIORITY_SYSTEM);
    expect(result.summaries.map((summary) => summary.priority)).toEqual([
      "primary",
    ]);
    expect(finalPrompts[0]).not.toContain("Low-priority changes");
  });

  test("progress labels distinguish the low-priority partition", async () => {
    const { runner } = stubRunner();
    const labels: string[] = [];
    await generateCommit(`${textDiff}\n${skillDiff}`, lowPriorityConfig, {
      runner,
      progress: { onPhase: (label) => labels.push(label) },
    });
    expect(labels[0]).toBe("Reading diff");
    expect(labels[1]).toBe("Reading low-priority diff");
    expect(labels[2]).toMatch(/^Writing commit message/);
  });

  test("overflow retries re-split within the low-priority partition", async () => {
    let rejected = false;
    const { runner, summaryCalls } = stubRunner((prompt, _index) => {
      if (!rejected && prompt.includes("secret.age")) {
        rejected = true;
        throw promptTooLong();
      }
    });
    const config: Config = { ...lowPriorityConfig, maxChunkTokens: 100_000 };
    const result = await generateCommit(
      `${textDiff}\n${armorDiff(1_000)}`,
      config,
      { runner },
    );
    expect(rejected).toBe(true);
    // One primary chunk, then several low-priority pieces after the retry.
    expect(result.summaries[0]!.priority).toBe("primary");
    const lowSummaries = result.summaries.slice(1);
    expect(lowSummaries.length).toBeGreaterThan(1);
    expect(lowSummaries.every((summary) => summary.priority === "low")).toBe(
      true,
    );
    expect(result.chunkCount).toBe(result.summaries.length);
    // Multi-part low-priority chunks are labelled as such.
    expect(
      summaryCalls
        .slice(1)
        .every((call) =>
          /part \d+ of \d+ of a larger low-priority diff/.test(call.prompt),
        ),
    ).toBe(true);
  });

  test("reports how many file sections matched the low-priority patterns", async () => {
    const { runner } = stubRunner();
    const mixed = await generateCommit(
      `${textDiff}\n${skillDiff}`,
      lowPriorityConfig,
      { runner },
    );
    expect(mixed.lowPriority).toEqual({
      matchedFiles: 1,
      totalFiles: 2,
      promoted: false,
    });

    const allLow = await generateCommit(skillDiff, lowPriorityConfig, {
      runner,
    });
    expect(allLow.lowPriority).toEqual({
      matchedFiles: 1,
      totalFiles: 1,
      promoted: true,
    });

    const none = await generateCommit(textDiff, baseConfig, { runner });
    expect(none.lowPriority).toEqual({
      matchedFiles: 0,
      totalFiles: 1,
      promoted: false,
    });
  });

  test("skipArmored redaction applies before partitioning", async () => {
    const { runner, summaryCalls } = stubRunner();
    const config: Config = { ...lowPriorityConfig, skipArmored: true };
    await generateCommit(`${textDiff}\n${armorDiff(400)}`, config, {
      runner,
    });
    expect(summaryCalls.length).toBe(2);
    expect(summaryCalls[1]!.system).toMatch(LOW_PRIORITY_SYSTEM);
    expect(summaryCalls[1]!.prompt).toContain(
      "[cco: 400 armored/encoded lines omitted]",
    );
    expect(summaryCalls[1]!.prompt).not.toContain("Ab9Xy");
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

describe("ignore", () => {
  const codeFile = [
    "diff --git a/src/app.ts b/src/app.ts",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1 +1 @@",
    "-const a = 1;",
    "+const a = 2;",
  ].join("\n");

  const vendorFile = [
    "diff --git a/vendor/big.js b/vendor/big.js",
    "--- a/vendor/big.js",
    "+++ b/vendor/big.js",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");

  /** A runner that records every prompt it was handed. */
  function recordingRunner(prompts: string[]): Runner {
    return (async (prompt: string) => {
      prompts.push(prompt);
      return { text: "A summary", costUsd: 0 } satisfies ModelResult;
    }) as Runner;
  }

  test("never sends ignored content to any model", async () => {
    const prompts: string[] = [];
    await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: ["vendor/**"] },
      { runner: recordingRunner(prompts) },
    );
    expect(prompts.some((p) => p.includes("vendor/big.js"))).toBe(false);
    expect(prompts.some((p) => p.includes("src/app.ts"))).toBe(true);
  });

  test("reports what it dropped", async () => {
    const result = await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: ["vendor/**"] },
      { runner: recordingRunner([]) },
    );
    expect(result.ignored).toEqual({ ignoredFiles: 1, totalFiles: 2 });
  });

  test("reports zero when the patterns matched nothing", async () => {
    const result = await generateCommit(
      codeFile,
      { ...baseConfig, ignore: ["node_modules/**"] },
      { runner: recordingRunner([]) },
    );
    expect(result.ignored).toEqual({ ignoredFiles: 0, totalFiles: 1 });
  });

  test("stops rather than describing a commit it was told not to read", async () => {
    const prompts: string[] = [];
    const promise = generateCommit(
      vendorFile,
      { ...baseConfig, ignore: ["vendor/**"] },
      { runner: recordingRunner(prompts) },
    );
    await expect(promise).rejects.toThrow(ClaudeCommitError);
    await expect(promise).rejects.toThrow(/"ignore" pattern/);
    // And it stopped before spending anything.
    expect(prompts).toEqual([]);
  });

  test("the fully-ignored error points at the way out", async () => {
    const error = await generateCommit(
      vendorFile,
      { ...baseConfig, ignore: ["vendor/**"] },
      { runner: recordingRunner([]) },
    ).catch((e) => e);
    expect(error.message).toMatch(/--no-ignore/);
  });

  test("runs ahead of the low-priority partition", async () => {
    const prompts: string[] = [];
    // vendor/ is ignored outright; app.ts is all that is left, so there is
    // no low-priority group and the primary prompt is the only one.
    const result = await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: ["vendor/**"], lowPriorityPaths: ["vendor/**"] },
      { runner: recordingRunner(prompts) },
    );
    expect(result.lowPriority.matchedFiles).toBe(0);
    expect(result.summaries.every((s) => s.priority === "primary")).toBe(true);
  });

  test("an empty pattern list changes nothing", async () => {
    const result = await generateCommit(
      `${codeFile}\n${vendorFile}`,
      { ...baseConfig, ignore: [] },
      { runner: recordingRunner([]) },
    );
    expect(result.ignored.ignoredFiles).toBe(0);
  });
});

describe("Ollama chunk sizing", () => {
  test("sizes summary chunks against the configured Ollama window", async () => {
    const prompts: string[] = [];
    const runner = (async (prompt: string) => {
      prompts.push(prompt);
      return { text: "A summary", costUsd: 0 } satisfies ModelResult;
    }) as Runner;

    // ~200k characters of ordinary diff: one chunk at Claude's 1M window,
    // several at an Ollama 8k one.
    const big = armorFreeDiff(4_000);
    const claudeRun = await generateCommit(big, baseConfig, { runner });
    const claudeChunks = claudeRun.chunkCount;

    prompts.length = 0;
    const ollamaRun = await generateCommit(
      big,
      {
        ...baseConfig,
        models: { summary: "ollama:gemma4", final: "sonnet" },
        ollama: { ...baseConfig.ollama, contextTokens: 8_192 },
      },
      { runner },
    );
    expect(claudeChunks).toBe(1);
    expect(ollamaRun.chunkCount).toBeGreaterThan(1);
  });
});

/** A plain (non-armored) diff of roughly `lines` changed lines. */
function armorFreeDiff(lines: number): string {
  const body = Array.from(
    { length: lines },
    (_, i) => `+  const value${i} = compute(${i}); // a line of ordinary code`,
  );
  return [
    "diff --git a/src/big.ts b/src/big.ts",
    "--- a/src/big.ts",
    "+++ b/src/big.ts",
    `@@ -1 +1,${lines} @@`,
    ...body,
  ].join("\n");
}
