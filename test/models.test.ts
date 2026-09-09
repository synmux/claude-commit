import { test, expect, describe } from "bun:test";
import {
  DEFAULT_OLLAMA_CONTEXT_TOKENS,
  describeModel,
  isOllamaModel,
  OLLAMA_PREFIX,
  parseModelRef,
} from "../src/models";
import { ClaudeCommitError } from "../src/errors";

describe("isOllamaModel", () => {
  test("recognises the prefix", () => {
    expect(isOllamaModel("ollama:gemma4")).toBe(true);
    expect(isOllamaModel("ollama:ornith-1.5:35b")).toBe(true);
  });

  test("is case-insensitive about the prefix only", () => {
    expect(isOllamaModel("Ollama:gemma4")).toBe(true);
    expect(isOllamaModel("OLLAMA:gemma4")).toBe(true);
  });

  test("tolerates surrounding whitespace", () => {
    expect(isOllamaModel("  ollama:gemma4  ")).toBe(true);
  });

  test("rejects Claude models and near-misses", () => {
    expect(isOllamaModel("sonnet")).toBe(false);
    expect(isOllamaModel("claude-opus-5")).toBe(false);
    // A model that merely mentions ollama is not prefixed with it.
    expect(isOllamaModel("my-ollama:model")).toBe(false);
    expect(isOllamaModel("ollama")).toBe(false);
  });
});

describe("parseModelRef", () => {
  test("passes a Claude model through untouched", () => {
    expect(parseModelRef("sonnet")).toEqual({
      provider: "claude",
      name: "sonnet",
    });
    expect(parseModelRef("claude-opus-5")).toEqual({
      provider: "claude",
      name: "claude-opus-5",
    });
  });

  test("keeps the Ollama tag, which is itself colon-separated", () => {
    // The whole point of the prefix rule: only the FIRST colon is cco's.
    expect(parseModelRef("ollama:ornith-1.5:35b")).toEqual({
      provider: "ollama",
      name: "ornith-1.5:35b",
    });
  });

  test("handles an untagged Ollama model", () => {
    expect(parseModelRef("ollama:gemma4")).toEqual({
      provider: "ollama",
      name: "gemma4",
    });
  });

  test("handles a namespaced Ollama model", () => {
    expect(parseModelRef("ollama:library/gemma4:e2b-it-qat")).toEqual({
      provider: "ollama",
      name: "library/gemma4:e2b-it-qat",
    });
  });

  test("matches the prefix case-insensitively but preserves the model's case", () => {
    expect(parseModelRef("Ollama:MyModel:Tag")).toEqual({
      provider: "ollama",
      name: "MyModel:Tag",
    });
  });

  test("trims whitespace around both the spec and the name", () => {
    expect(parseModelRef("  ollama:  gemma4  ")).toEqual({
      provider: "ollama",
      name: "gemma4",
    });
    expect(parseModelRef("  sonnet  ")).toEqual({
      provider: "claude",
      name: "sonnet",
    });
  });

  test("rejects a prefix with no model after it", () => {
    expect(() => parseModelRef("ollama:")).toThrow(ClaudeCommitError);
    expect(() => parseModelRef("ollama:   ")).toThrow(/names no Ollama model/);
  });

  test("rejects an empty model string", () => {
    expect(() => parseModelRef("")).toThrow(ClaudeCommitError);
    expect(() => parseModelRef("   ")).toThrow(/No model configured/);
  });
});

describe("describeModel", () => {
  test("names the provider for error messages", () => {
    expect(describeModel("sonnet")).toBe("sonnet (Claude)");
    expect(describeModel("ollama:gemma4")).toBe("ollama:gemma4 (Ollama)");
  });
});

describe("constants", () => {
  test("the prefix is what the documented config uses", () => {
    expect(OLLAMA_PREFIX).toBe("ollama:");
  });

  test("the default context sits on Ollama's middle VRAM tier", () => {
    expect(DEFAULT_OLLAMA_CONTEXT_TOKENS).toBe(32_768);
  });
});
