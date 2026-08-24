import { test, expect, describe } from "bun:test";
import { createLowPriorityMatcher, isLowPriorityPath } from "../src/paths";

describe("isLowPriorityPath - anchored patterns (containing a slash)", () => {
  const patterns = [".agents/skills/*-skilld"];

  test("matches the directory itself", () => {
    expect(isLowPriorityPath(".agents/skills/ora-skilld", patterns)).toBe(true);
  });

  test("matches every file beneath a matching directory", () => {
    expect(
      isLowPriorityPath(".agents/skills/ora-skilld/SKILL.md", patterns),
    ).toBe(true);
    expect(
      isLowPriorityPath(
        ".agents/skills/ora-skilld/references/deep/file.md",
        patterns,
      ),
    ).toBe(true);
  });

  test("does not match siblings that fail the glob", () => {
    expect(isLowPriorityPath(".agents/skills/verify/SKILL.md", patterns)).toBe(
      false,
    );
    expect(isLowPriorityPath(".agents/skills/skilld-lock.yaml", patterns)).toBe(
      false,
    );
  });

  test("is anchored at the repository root", () => {
    expect(
      isLowPriorityPath("vendor/.agents/skills/ora-skilld/SKILL.md", patterns),
    ).toBe(false);
  });

  test("a single star does not cross directory boundaries", () => {
    expect(isLowPriorityPath("docs/a/b.md", ["docs/*.md"])).toBe(false);
    expect(isLowPriorityPath("docs/b.md", ["docs/*.md"])).toBe(true);
  });

  test("double star crosses directory boundaries", () => {
    expect(isLowPriorityPath("docs/a/b/c.md", ["docs/**/*.md"])).toBe(true);
    expect(isLowPriorityPath("src/x/y.ts", ["src/**"])).toBe(true);
  });

  test("a leading slash anchors like gitignore and is otherwise ignored", () => {
    expect(isLowPriorityPath("bun.lock", ["/bun.lock"])).toBe(true);
    expect(isLowPriorityPath("sub/bun.lock", ["/bun.lock"])).toBe(false);
  });

  test("a trailing slash means 'this directory and its contents'", () => {
    expect(isLowPriorityPath("dist/index.js", ["dist/"])).toBe(true);
    expect(isLowPriorityPath("dist", ["dist/"])).toBe(true);
    expect(isLowPriorityPath("dist.txt", ["dist/"])).toBe(false);
  });
});

describe("isLowPriorityPath - bare patterns (no slash)", () => {
  test("match a file's basename at any depth", () => {
    expect(isLowPriorityPath("bun.lock", ["bun.lock"])).toBe(true);
    expect(isLowPriorityPath("packages/app/bun.lock", ["bun.lock"])).toBe(true);
    expect(isLowPriorityPath("sub/dir/yarn.lock", ["*.lock"])).toBe(true);
  });

  test("match a directory name at any depth, covering its contents", () => {
    expect(
      isLowPriorityPath(".agents/skills/ora-skilld/SKILL.md", ["*-skilld"]),
    ).toBe(true);
    expect(isLowPriorityPath("a/node_modules/x/y.js", ["node_modules"])).toBe(
      true,
    );
  });

  test("do not match partial segments", () => {
    expect(isLowPriorityPath("bun.lockb", ["bun.lock"])).toBe(false);
    expect(isLowPriorityPath("mybun.lock", ["bun.lock"])).toBe(false);
  });
});

describe("isLowPriorityPath - normalisation and edge cases", () => {
  test("strips a leading ./ or / from the path", () => {
    expect(isLowPriorityPath("./bun.lock", ["bun.lock"])).toBe(true);
    expect(isLowPriorityPath("/bun.lock", ["bun.lock"])).toBe(true);
    expect(isLowPriorityPath("./dist/x.js", ["dist/**"])).toBe(true);
  });

  test("a literal backslash in a path is a filename character, not a separator", () => {
    // Git always emits `/` separators, so a backslash only ever arrives as
    // part of a (POSIX) filename and must not split it into segments.
    expect(isLowPriorityPath("weird\\name.txt", ["name.txt"])).toBe(false);
    expect(isLowPriorityPath("dist\\x.js", ["dist/**"])).toBe(false);
  });

  test("strips a leading ./ from a pattern too", () => {
    expect(isLowPriorityPath("bun.lock", ["./bun.lock"])).toBe(true);
    expect(isLowPriorityPath("dist/x.js", ["./dist/**"])).toBe(true);
    expect(isLowPriorityPath("sub/bun.lock", ["./bun.lock"])).toBe(false);
  });

  test("a slash anywhere in a brace group anchors every alternative", () => {
    // Documented limitation: anchoring is decided on the whole pattern text.
    const pattern = ["{docs/**,bun.lock}"];
    expect(isLowPriorityPath("docs/a.md", pattern)).toBe(true);
    expect(isLowPriorityPath("bun.lock", pattern)).toBe(true);
    expect(isLowPriorityPath("sub/bun.lock", pattern)).toBe(false);
  });

  test("an empty pattern list matches nothing", () => {
    expect(isLowPriorityPath("bun.lock", [])).toBe(false);
  });

  test("an empty path matches nothing", () => {
    expect(isLowPriorityPath("", ["**"])).toBe(false);
  });

  test("blank patterns are ignored rather than matching everything", () => {
    expect(isLowPriorityPath("src/index.ts", ["", "   "])).toBe(false);
  });

  test("any one of several patterns is enough", () => {
    const patterns = ["bun.lock", "dist/**"];
    expect(isLowPriorityPath("src/index.ts", patterns)).toBe(false);
    expect(isLowPriorityPath("dist/index.js", patterns)).toBe(true);
    expect(isLowPriorityPath("bun.lock", patterns)).toBe(true);
  });

  test("brace expansion works", () => {
    expect(isLowPriorityPath("a.lock", ["*.{lock,lockb}"])).toBe(true);
    expect(isLowPriorityPath("a.lockb", ["*.{lock,lockb}"])).toBe(true);
  });
});

describe("isLowPriorityPath - negation", () => {
  test("a leading ! re-includes paths matched by an earlier pattern", () => {
    const patterns = ["docs/**", "!docs/adr/**"];
    expect(isLowPriorityPath("docs/guide.md", patterns)).toBe(true);
    expect(isLowPriorityPath("docs/adr/0001.md", patterns)).toBe(false);
  });

  test("the last matching pattern wins, so order matters", () => {
    expect(
      isLowPriorityPath("docs/adr/x.md", ["!docs/adr/**", "docs/**"]),
    ).toBe(true);
  });

  test("negation works against bare patterns", () => {
    const patterns = ["node_modules", "!a/node_modules/keep.md"];
    expect(isLowPriorityPath("a/node_modules/x.js", patterns)).toBe(true);
    expect(isLowPriorityPath("a/node_modules/keep.md", patterns)).toBe(false);
  });

  test("a list of only negations matches nothing", () => {
    expect(isLowPriorityPath("docs/x.md", ["!docs/**"])).toBe(false);
  });

  test("a bare ! or blank negation is ignored", () => {
    expect(isLowPriorityPath("docs/x.md", ["docs/**", "!", "! "])).toBe(true);
  });

  test("a backslash escapes a literal leading bang", () => {
    expect(isLowPriorityPath("!weird.lock", ["\\!weird.lock"])).toBe(true);
    expect(isLowPriorityPath("weird.lock", ["\\!weird.lock"])).toBe(false);
  });
});

describe("createLowPriorityMatcher", () => {
  test("returns a reusable predicate with the same semantics", () => {
    const matches = createLowPriorityMatcher([".agents/skills/*-skilld"]);
    expect(matches(".agents/skills/ora-skilld/SKILL.md")).toBe(true);
    expect(matches("src/index.ts")).toBe(false);
  });

  test("with no patterns, never matches", () => {
    const matches = createLowPriorityMatcher([]);
    expect(matches("anything")).toBe(false);
  });
});

describe("isLowPriorityPath - ill-formed patterns are parsed, not rejected", () => {
  // Bun.Glob never throws, but it does not reliably match nothing either:
  // these pin the real behaviour so a Bun upgrade cannot silently change
  // how a typo in the config classifies a diff.
  test("an unbalanced brace group becomes its first alternative", () => {
    expect(isLowPriorityPath("docs/guide.md", ["{docs,build"])).toBe(true);
    expect(isLowPriorityPath("src/docs/util.ts", ["{docs,build"])).toBe(true);
    expect(isLowPriorityPath("build/out.js", ["{docs,build"])).toBe(false);
  });

  test("an unterminated character class matches nothing, not even its literal text", () => {
    expect(isLowPriorityPath("[abc", ["[abc"])).toBe(false);
    expect(isLowPriorityPath("[abc", ["\\[abc"])).toBe(true);
  });

  test("an ill-formed pattern never throws", () => {
    expect(() =>
      isLowPriorityPath("x", ["[z-a]", "{{{", "\\", "**/[!]"]),
    ).not.toThrow();
  });
});
