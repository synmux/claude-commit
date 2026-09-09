import { test, expect, describe } from "bun:test";
import {
  clampChunkTokens,
  CONTEXT_RESERVE_TOKENS,
  contextReserveTokens,
  contextWindowTokens,
  estimateDiffTokens,
  estimateTokens,
  isOpaqueLine,
  OPAQUE_CHARS_PER_TOKEN,
  tokensToChars,
} from "../src/tokens";

describe("token estimation", () => {
  test("estimateTokens divides by the ratio and rounds up", () => {
    expect(estimateTokens("", 4)).toBe(0);
    expect(estimateTokens("abcd", 4)).toBe(1);
    expect(estimateTokens("abcde", 4)).toBe(2);
  });

  test("tokensToChars inverts the ratio", () => {
    expect(tokensToChars(100, 3.5)).toBe(350);
    expect(tokensToChars(0, 4)).toBe(0);
  });

  test("rejects a non-positive ratio", () => {
    expect(() => estimateTokens("x", 0)).toThrow();
    expect(() => estimateTokens("x", -1)).toThrow();
  });
});

describe("contextWindowTokens", () => {
  test("bare aliases resolve to current-generation 1M models", () => {
    expect(contextWindowTokens("sonnet")).toBe(1_000_000);
    expect(contextWindowTokens("opus")).toBe(1_000_000);
  });

  test("current-generation ids have a 1M window", () => {
    expect(contextWindowTokens("claude-sonnet-5")).toBe(1_000_000);
    expect(contextWindowTokens("claude-sonnet-4-6")).toBe(1_000_000);
    expect(contextWindowTokens("claude-opus-4-6")).toBe(1_000_000);
    expect(contextWindowTokens("claude-opus-4-7")).toBe(1_000_000);
    expect(contextWindowTokens("claude-opus-4-8")).toBe(1_000_000);
    expect(contextWindowTokens("claude-fable-5")).toBe(1_000_000);
  });

  test("the [1m] long-context suffix grants a 1M window", () => {
    expect(contextWindowTokens("claude-sonnet-4-5[1m]")).toBe(1_000_000);
  });

  test("haiku models get the 200k floor", () => {
    expect(contextWindowTokens("haiku")).toBe(200_000);
    expect(contextWindowTokens("claude-haiku-4-5")).toBe(200_000);
    expect(contextWindowTokens("claude-haiku-4-5-20251001")).toBe(200_000);
  });

  test("pre-4.6 pinned ids get the 200k floor", () => {
    expect(contextWindowTokens("claude-sonnet-4-5-20250929")).toBe(200_000);
    expect(contextWindowTokens("claude-opus-4-5-20251101")).toBe(200_000);
    expect(contextWindowTokens("claude-opus-4-1-20250805")).toBe(200_000);
  });

  test("unknown models get the conservative 200k floor", () => {
    expect(contextWindowTokens("my-custom-model")).toBe(200_000);
    expect(contextWindowTokens("")).toBe(200_000);
  });
});

describe("isOpaqueLine", () => {
  const armor = "Ab9Xy".repeat(13); // 65 chars, no whitespace

  test("recognises long unbroken runs with or without a diff marker", () => {
    expect(isOpaqueLine(armor)).toBe(true);
    expect(isOpaqueLine(`+${armor}`)).toBe(true);
    expect(isOpaqueLine(`-${armor}`)).toBe(true);
    expect(isOpaqueLine(` ${armor}`)).toBe(true);
  });

  test("rejects short runs and anything containing whitespace", () => {
    expect(isOpaqueLine("+QWx")).toBe(false);
    expect(isOpaqueLine("+const value = compute(input);")).toBe(false);
    expect(isOpaqueLine("@@ -1,5 +1,5 @@")).toBe(false);
    expect(isOpaqueLine("diff --git a/x.age b/x.age")).toBe(false);
    expect(isOpaqueLine(`+${armor} trailing`)).toBe(false);
  });
});

describe("estimateDiffTokens", () => {
  const armorLine = `+${"Ab9Xy".repeat(13)}`; // 66 chars incl. marker
  const textLine = "+const value = compute(input);";

  test("estimates plain text at the configured ratio", () => {
    const text = Array.from({ length: 10 }, () => textLine).join("\n");
    expect(estimateDiffTokens(text, 3.5)).toBe(
      Math.ceil(((textLine.length + 1) * 10) / 3.5),
    );
  });

  test("estimates opaque lines at the opaque ratio", () => {
    const armor = Array.from({ length: 10 }, () => armorLine).join("\n");
    expect(estimateDiffTokens(armor, 3.5)).toBe(
      Math.ceil(((armorLine.length + 1) * 10) / OPAQUE_CHARS_PER_TOKEN),
    );
  });

  test("mixed content sums both classes", () => {
    const mixed = `${textLine}\n${armorLine}`;
    expect(estimateDiffTokens(mixed, 3.5)).toBe(
      Math.ceil(
        (textLine.length + 1) / 3.5 +
          (armorLine.length + 1) / OPAQUE_CHARS_PER_TOKEN,
      ),
    );
  });

  test("armor-heavy content estimates far above a plain chars ratio", () => {
    const armor = Array.from({ length: 100 }, () => armorLine).join("\n");
    const classified = estimateDiffTokens(armor, 3.5);
    const plain = estimateTokens(armor, 3.5);
    expect(classified).toBeGreaterThan(plain * 3);
  });

  test("rejects a non-positive ratio", () => {
    expect(() => estimateDiffTokens("x", 0)).toThrow();
  });
});

describe("clampChunkTokens", () => {
  test("leaves the default budget alone on a 1M-context model", () => {
    expect(clampChunkTokens("sonnet", 600_000)).toBe(600_000);
  });

  test("clamps an oversized budget to the window minus the reserve", () => {
    expect(clampChunkTokens("sonnet", 2_000_000)).toBe(
      1_000_000 - CONTEXT_RESERVE_TOKENS,
    );
    expect(clampChunkTokens("haiku", 600_000)).toBe(
      200_000 - CONTEXT_RESERVE_TOKENS,
    );
  });

  test("never raises a budget below the clamp", () => {
    expect(clampChunkTokens("haiku", 100_000)).toBe(100_000);
    expect(clampChunkTokens("sonnet", 50_000)).toBe(50_000);
  });
});

describe("context reserve", () => {
  test("both Claude tiers keep the full flat reserve, unchanged", () => {
    expect(contextReserveTokens(200_000)).toBe(CONTEXT_RESERVE_TOKENS);
    expect(contextReserveTokens(1_000_000)).toBe(CONTEXT_RESERVE_TOKENS);
  });

  test("a small window reserves a quarter instead of being swallowed whole", () => {
    // A flat 32k reserve against a 32k window would leave a budget of zero.
    expect(contextReserveTokens(32_768)).toBe(8_192);
    expect(contextReserveTokens(4_096)).toBe(1_024);
  });

  test("the crossover is where a quarter of the window equals the flat reserve", () => {
    expect(contextReserveTokens(128_000)).toBe(CONTEXT_RESERVE_TOKENS);
    expect(contextReserveTokens(127_996)).toBe(31_999);
  });
});

describe("Ollama context windows", () => {
  test("an ollama: model's window is whatever the config asked for", () => {
    expect(contextWindowTokens("ollama:gemma4", 16_384)).toBe(16_384);
    expect(contextWindowTokens("ollama:ornith-1.5:35b", 65_536)).toBe(65_536);
  });

  test("the model name never implies a window for Ollama", () => {
    // "sonnet" inside an Ollama tag must not trip the 1M regex.
    expect(contextWindowTokens("ollama:my-sonnet-clone:8b", 8_192)).toBe(8_192);
  });

  test("falls back to the documented default", () => {
    expect(contextWindowTokens("ollama:gemma4")).toBe(32_768);
  });

  test("Claude models ignore the Ollama context argument entirely", () => {
    expect(contextWindowTokens("sonnet", 8_192)).toBe(1_000_000);
    expect(contextWindowTokens("haiku", 8_192)).toBe(200_000);
  });

  test("clampChunkTokens sizes chunks for the Ollama window", () => {
    // 32768 - 8192 reserve, well under the configured 600k cap.
    expect(clampChunkTokens("ollama:gemma4", 600_000, 32_768)).toBe(24_576);
  });

  test("a generous config still cannot exceed the window", () => {
    expect(clampChunkTokens("ollama:gemma4", 600_000, 8_192)).toBe(6_144);
  });

  test("a tighter maxChunkTokens still wins", () => {
    expect(clampChunkTokens("ollama:gemma4", 1_000, 32_768)).toBe(1_000);
  });

  test("never returns a budget of zero, whatever the numbers say", () => {
    expect(clampChunkTokens("ollama:tiny", 600_000, 1)).toBeGreaterThan(0);
  });

  test("Claude budgets are exactly what they were before", () => {
    expect(clampChunkTokens("sonnet", 600_000)).toBe(600_000);
    expect(clampChunkTokens("haiku", 600_000)).toBe(200_000 - 32_000);
  });
});
