import { test, expect, describe } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { partitionDiff, sectionPaths } from "../src/diff";
import { getStagedDiff, getStagedFiles, getStagedStat } from "../src/git";

/**
 * A throwaway repository with `top.txt`, `sub/file.txt` and a freshly added
 * submodule `engine` staged, and every user-level diff setting that could
 * change the diff's shape or membership switched on: `diff.relative`,
 * `diff.noprefix`, `diff.mnemonicPrefix`, `diff.submodule=log` (replaces the
 * gitlink section with a header-less `Submodule ...` block),
 * `diff.ignoreSubmodules=all` (hides the gitlink entirely) and
 * `diff.external` (an external driver that forges a `diff --git` header).
 * Runs `fn` with the working directory inside `sub/`, then restores it.
 */
async function withStagedRepo(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cco-git-"));
  const originalCwd = process.cwd();
  try {
    // A one-commit repository to add as a submodule (signing off: the
    // user's global 1Password signer cannot run headless).
    const engine = join(dir, "engine-src");
    await mkdir(engine);
    await $`git -C ${engine} init -q`.quiet();
    await $`git -C ${engine} config user.email cco@example.invalid`.quiet();
    await $`git -C ${engine} config user.name cco`.quiet();
    await $`git -C ${engine} config commit.gpgsign false`.quiet();
    await writeFile(join(engine, "engine.txt"), "engine\n");
    await $`git -C ${engine} add -A`.quiet();
    await $`git -C ${engine} commit -qm engine`.quiet();

    const externalDiff = join(dir, "external-diff.sh");
    await writeFile(
      externalDiff,
      '#!/bin/sh\necho "diff --git a/hijacked.txt b/hijacked.txt"\n',
      { mode: 0o755 },
    );

    const repo = join(dir, "repo");
    await mkdir(repo);
    await $`git -C ${repo} init -q`.quiet();
    await $`git -C ${repo} config user.email cco@example.invalid`.quiet();
    await $`git -C ${repo} config user.name cco`.quiet();
    await $`git -C ${repo} config diff.relative true`.quiet();
    await $`git -C ${repo} config diff.noprefix true`.quiet();
    await $`git -C ${repo} config diff.mnemonicPrefix true`.quiet();
    await $`git -C ${repo} config diff.submodule log`.quiet();
    await $`git -C ${repo} config diff.ignoreSubmodules all`.quiet();
    await $`git -C ${repo} config diff.external ${externalDiff}`.quiet();
    await writeFile(join(repo, "top.txt"), "top\n");
    await mkdir(join(repo, "sub"));
    await writeFile(join(repo, "sub", "file.txt"), "nested\n");
    await $`git -C ${repo} -c protocol.file.allow=always submodule add -q ${engine} engine`.quiet();
    await $`git -C ${repo} add -A`.quiet();
    process.chdir(join(repo, "sub"));
    await fn(repo);
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

describe("staged-change readers", () => {
  test("getStagedDiff ignores diff.relative/noprefix/mnemonicPrefix and the invocation directory", async () => {
    await withStagedRepo(async () => {
      const diff = await getStagedDiff();
      // diff.relative would drop top.txt entirely and strip `sub/`;
      // noprefix/mnemonicPrefix would change the a/ b/ prefixes.
      expect(diff).toContain("diff --git a/top.txt b/top.txt");
      expect(diff).toContain("diff --git a/sub/file.txt b/sub/file.txt");
      expect(diff).toContain("+++ b/sub/file.txt");
      expect(diff).toContain("+++ b/top.txt");
    });
  });

  test("getStagedDiff keeps a submodule as its own diff --git section despite diff.submodule/ignoreSubmodules", async () => {
    await withStagedRepo(async () => {
      const diff = await getStagedDiff();
      expect(diff).toContain("diff --git a/engine b/engine");
      expect(diff).toContain("+Subproject commit");
      expect(diff).not.toContain("Submodule engine");
      // The gitlink section is recognisable and partitionable on its own.
      const { primary, totalFiles } = partitionDiff(diff, () => false);
      const engineSection = primary
        .split("\ndiff --git ")
        .find((section) => section.includes("a/engine b/engine"));
      expect(engineSection).toBeDefined();
      expect(
        sectionPaths(
          `diff --git ${engineSection!.replace(/^diff --git /, "")}`,
        ),
      ).toEqual(["engine"]);
      expect(totalFiles).toBe(4); // .gitmodules, engine, sub/file.txt, top.txt
    });
  });

  test("getStagedDiff never runs an external diff driver", async () => {
    await withStagedRepo(async () => {
      const diff = await getStagedDiff();
      expect(diff).not.toContain("hijacked");
      expect(diff).toContain("+++ b/top.txt");
    });
  });

  test("getStagedFiles and getStagedStat cover the whole staged set from a subdirectory", async () => {
    await withStagedRepo(async () => {
      const files = await getStagedFiles();
      expect(files.map((file) => file.path).sort()).toEqual([
        ".gitmodules",
        "engine",
        "sub/file.txt",
        "top.txt",
      ]);
      const stat = await getStagedStat();
      expect(stat).toContain("top.txt");
      expect(stat).toContain("sub/file.txt");
      expect(stat).toContain("engine");
    });
  });
});
