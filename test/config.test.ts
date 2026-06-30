import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  loadFileConfig,
  mergeConfig,
  mergePartial,
  resolveConfig,
  sanitizePartial,
} from "../src/config";

describe("sanitizePartial", () => {
  test("keeps known keys with correct types", () => {
    const out = sanitizePartial({
      conventionalCommits: true,
      gitmoji: "yes", // wrong type — ignored
      multiline: false,
      template: "[X] {message}",
      interactiveCount: 4.9,
      models: { summary: "opus", final: 123 },
      bogus: "nope",
    });
    expect(out.conventionalCommits).toBe(true);
    expect(out.gitmoji).toBeUndefined();
    expect(out.multiline).toBe(false);
    expect(out.template).toBe("[X] {message}");
    expect(out.interactiveCount).toBe(4);
    expect(out.models).toEqual({ summary: "opus" });
    expect((out as Record<string, unknown>).bogus).toBeUndefined();
  });

  test("non-objects yield an empty config", () => {
    expect(sanitizePartial(null)).toEqual({});
    expect(sanitizePartial("x")).toEqual({});
  });
});

describe("mergeConfig / mergePartial", () => {
  test("mergeConfig overrides scalars and merges models", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      gitmoji: true,
      models: { final: "opus" },
    });
    expect(merged.gitmoji).toBe(true);
    expect(merged.models.summary).toBe(DEFAULT_CONFIG.models.summary);
    expect(merged.models.final).toBe("opus");
  });

  test("mergePartial combines nested models", () => {
    const out = mergePartial(
      { models: { summary: "a" } },
      { models: { final: "b" } },
    );
    expect(out.models).toEqual({ summary: "a", final: "b" });
  });
});

describe("resolveConfig precedence", () => {
  test("flags beat file config beat defaults", () => {
    const cfg = resolveConfig(
      { gitmoji: true, multiline: true },
      { multiline: false },
    );
    expect(cfg.gitmoji).toBe(true); // from file
    expect(cfg.multiline).toBe(false); // flag overrides file
    expect(cfg.conventionalCommits).toBe(false); // default
  });
});

describe("loadFileConfig", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cc-config-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("reads .claudecommit.json", async () => {
    await writeFile(
      join(dir, ".claudecommit.json"),
      JSON.stringify({ conventionalCommits: true }),
    );
    const cfg = await loadFileConfig(dir, dir);
    expect(cfg.conventionalCommits).toBe(true);
  });

  test("config file overrides package.json", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ claudecommit: { gitmoji: true, multiline: true } }),
    );
    await writeFile(
      join(dir, ".claudecommit.json"),
      JSON.stringify({ multiline: false }),
    );
    const cfg = await loadFileConfig(dir, dir);
    expect(cfg.gitmoji).toBe(true); // from package.json
    expect(cfg.multiline).toBe(false); // overridden by file
  });

  test("walks up to the repo root to find a config", async () => {
    const nested = join(dir, "a", "b");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(dir, ".claudecommit.json"),
      JSON.stringify({ template: "[T] {message}" }),
    );
    const cfg = await loadFileConfig(nested, dir);
    expect(cfg.template).toBe("[T] {message}");
  });

  test("an explicit missing config path throws", async () => {
    await expect(loadFileConfig(dir, dir, "nope.json")).rejects.toThrow();
  });
});
