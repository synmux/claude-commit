import { test, expect, describe } from "bun:test";
import {
  clampChunkTokens,
  CONTEXT_RESERVE_TOKENS,
  contextWindowTokens,
  estimateTokens,
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
