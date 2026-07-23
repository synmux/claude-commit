import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  globalConfigDir,
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
      gitmoji: "yes", // wrong type - ignored
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

  test("interactiveTemperature: accepts null, clamps to 0..2, ignores bad types", () => {
    expect(
      sanitizePartial({ interactiveTemperature: null }).interactiveTemperature,
    ).toBe(null);
    expect(
      sanitizePartial({ interactiveTemperature: 0.8 }).interactiveTemperature,
    ).toBe(0.8);
    expect(
      sanitizePartial({ interactiveTemperature: 5 }).interactiveTemperature,
    ).toBe(2);
    expect(
      sanitizePartial({ interactiveTemperature: -1 }).interactiveTemperature,
    ).toBe(0);
    expect(
      sanitizePartial({ interactiveTemperature: "hot" }).interactiveTemperature,
    ).toBeUndefined();
  });
});

describe("default config", () => {
  test("bumps interactive temperature by default", () => {
    expect(DEFAULT_CONFIG.interactiveTemperature).toBe(1);
  });

  test("does not allow API credentials by default", () => {
    expect(DEFAULT_CONFIG.allowApiKey).toBe(false);
  });
});

describe("skipArmored", () => {
  test("sanitizes to booleans only and defaults to false", () => {
    expect(sanitizePartial({ skipArmored: true }).skipArmored).toBe(true);
    expect(sanitizePartial({ skipArmored: "yes" }).skipArmored).toBeUndefined();
    expect(DEFAULT_CONFIG.skipArmored).toBe(false);
    expect(resolveConfig({ skipArmored: true }, {}).skipArmored).toBe(true);
  });
});

describe("allowApiKey", () => {
  test("sanitizePartial accepts booleans only", () => {
    expect(sanitizePartial({ allowApiKey: true }).allowApiKey).toBe(true);
    expect(sanitizePartial({ allowApiKey: false }).allowApiKey).toBe(false);
    expect(sanitizePartial({ allowApiKey: "yes" }).allowApiKey).toBeUndefined();
    expect(sanitizePartial({ allowApiKey: 1 }).allowApiKey).toBeUndefined();
  });

  test("resolves through the precedence chain", () => {
    expect(resolveConfig({}, {}).allowApiKey).toBe(false);
    expect(resolveConfig({ allowApiKey: true }, {}).allowApiKey).toBe(true);
  });
});

describe("interactive", () => {
  test("sanitizePartial accepts booleans only", () => {
    expect(sanitizePartial({ interactive: true }).interactive).toBe(true);
    expect(sanitizePartial({ interactive: false }).interactive).toBe(false);
    expect(sanitizePartial({ interactive: "yes" }).interactive).toBeUndefined();
    expect(sanitizePartial({ interactive: 1 }).interactive).toBeUndefined();
  });

  test("defaults to false", () => {
    expect(DEFAULT_CONFIG.interactive).toBe(false);
  });

  test("resolves through the precedence chain", () => {
    expect(resolveConfig({}, {}).interactive).toBe(false); // default
    expect(resolveConfig({ interactive: true }, {}).interactive).toBe(true); // file
    // A `--no-interactive` flag (false) overrides a file that enables it.
    expect(
      resolveConfig({ interactive: true }, { interactive: false }).interactive,
    ).toBe(false);
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
    dir = await mkdtemp(join(tmpdir(), "cco-config-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("reads .claude-commit.json", async () => {
    await writeFile(
      join(dir, ".claude-commit.json"),
      JSON.stringify({ conventionalCommits: true }),
    );
    const cfg = await loadFileConfig(dir, dir);
    expect(cfg.conventionalCommits).toBe(true);
  });

  test("reads allowApiKey from a config file", async () => {
    await writeFile(
      join(dir, ".claude-commit.json"),
      JSON.stringify({ allowApiKey: true }),
    );
    const cfg = await loadFileConfig(dir, dir);
    expect(cfg.allowApiKey).toBe(true);
  });

  test("config file overrides package.json", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ "claude-commit": { gitmoji: true, multiline: true } }),
    );
    await writeFile(
      join(dir, ".claude-commit.json"),
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
      join(dir, ".claude-commit.json"),
      JSON.stringify({ template: "[T] {message}" }),
    );
    const cfg = await loadFileConfig(nested, dir);
    expect(cfg.template).toBe("[T] {message}");
  });

  test("an explicit missing config path throws", async () => {
    await expect(loadFileConfig(dir, dir, "nope.json")).rejects.toThrow();
  });

  test("tolerates a malformed package.json instead of blocking", async () => {
    // package.json has many purposes; a syntax error in it (the user may even
    // be committing the fix) must not stop cco from loading its own config.
    await writeFile(join(dir, "package.json"), "{ not: valid json ");
    await writeFile(
      join(dir, ".claude-commit.json"),
      JSON.stringify({ gitmoji: true }),
    );
    const cfg = await loadFileConfig(dir, dir);
    expect(cfg.gitmoji).toBe(true);
  });

  test("a malformed dedicated config file throws", async () => {
    await writeFile(join(dir, ".claude-commit.json"), "{ broken ");
    await expect(loadFileConfig(dir, dir)).rejects.toThrow();
  });

  test("a malformed explicit --config file throws", async () => {
    await writeFile(join(dir, "custom.json"), "{ nope ");
    await expect(loadFileConfig(dir, dir, "custom.json")).rejects.toThrow();
  });
});

describe("global config (XDG)", () => {
  let projectDir: string;
  let xdgDir: string;
  const globalDir = () => join(xdgDir, "claude-commit");
  const env = () => ({ XDG_CONFIG_HOME: xdgDir });

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cco-project-"));
    xdgDir = await mkdtemp(join(tmpdir(), "cco-xdg-"));
    await mkdir(globalDir(), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(xdgDir, { recursive: true, force: true });
  });

  test("globalConfigDir honours an absolute XDG_CONFIG_HOME", () => {
    expect(globalConfigDir({ XDG_CONFIG_HOME: "/tmp/xdg" })).toBe(
      "/tmp/xdg/claude-commit",
    );
  });

  test("globalConfigDir falls back to ~/.config when XDG is unset or relative", () => {
    expect(globalConfigDir({})).toMatch(/\.config\/claude-commit$/);
    expect(globalConfigDir({ XDG_CONFIG_HOME: "not/absolute" })).toMatch(
      /\.config\/claude-commit$/,
    );
  });

  test("reads config.json from the global directory", async () => {
    await writeFile(
      join(globalDir(), "config.json"),
      JSON.stringify({ gitmoji: true }),
    );
    const cfg = await loadFileConfig(projectDir, projectDir, undefined, env());
    expect(cfg.gitmoji).toBe(true);
  });

  test("also accepts the project-style filenames in the global directory", async () => {
    await writeFile(
      join(globalDir(), ".claude-commit.json"),
      JSON.stringify({ multiline: true }),
    );
    const cfg = await loadFileConfig(projectDir, projectDir, undefined, env());
    expect(cfg.multiline).toBe(true);
  });

  test("a project config file overrides the global config", async () => {
    await writeFile(
      join(globalDir(), "config.json"),
      JSON.stringify({ gitmoji: true, multiline: true }),
    );
    await writeFile(
      join(projectDir, ".claude-commit.json"),
      JSON.stringify({ multiline: false }),
    );
    const cfg = await loadFileConfig(projectDir, projectDir, undefined, env());
    expect(cfg.gitmoji).toBe(true); // inherited from global
    expect(cfg.multiline).toBe(false); // project overrides global
  });

  test("package.json overrides the global config", async () => {
    await writeFile(
      join(globalDir(), "config.json"),
      JSON.stringify({ conventionalCommits: false }),
    );
    await writeFile(
      join(projectDir, "package.json"),
      JSON.stringify({ "claude-commit": { conventionalCommits: true } }),
    );
    const cfg = await loadFileConfig(projectDir, projectDir, undefined, env());
    expect(cfg.conventionalCommits).toBe(true);
  });

  test("config.json is a global-only name - not discovered in the project tree", async () => {
    // A stray config.json inside the project must be ignored; only the dotted
    // names apply further down the tree.
    await writeFile(
      join(projectDir, "config.json"),
      JSON.stringify({ gitmoji: true }),
    );
    const cfg = await loadFileConfig(projectDir, projectDir, undefined, env());
    expect(cfg.gitmoji).toBeUndefined();
  });

  test("a malformed global config throws", async () => {
    await writeFile(join(globalDir(), "config.json"), "{ broken ");
    await expect(
      loadFileConfig(projectDir, projectDir, undefined, env()),
    ).rejects.toThrow();
  });
});
