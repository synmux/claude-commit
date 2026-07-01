import { test, expect, describe } from "bun:test";
import { estimateTokens, tokensToChars } from "../src/tokens";

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
