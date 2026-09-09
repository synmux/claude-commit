import { test, expect, describe } from "bun:test";
import { createPathMatcher, matchesPathPatterns } from "../src/paths";

describe("matchesPathPatterns - anchored patterns (containing a slash)", () => {
  const patterns = [".agents/skills/*-skilld"];

  test("matches the directory itself", () => {
    expect(matchesPathPatterns(".agents/skills/ora-skilld", patterns)).toBe(
      true,
    );
  });

  test("matches every file beneath a matching directory", () => {
    expect(
      matchesPathPatterns(".agents/skills/ora-skilld/SKILL.md", patterns),
    ).toBe(true);
    expect(
      matchesPathPatterns(
        ".agents/skills/ora-skilld/references/deep/file.md",
        patterns,
      ),
    ).toBe(true);
  });

  test("does not match siblings that fail the glob", () => {
    expect(
      matchesPathPatterns(".agents/skills/verify/SKILL.md", patterns),
    ).toBe(false);
    expect(
      matchesPathPatterns(".agents/skills/skilld-lock.yaml", patterns),
    ).toBe(false);
  });

  test("is anchored at the repository root", () => {
    expect(
      matchesPathPatterns(
        "vendor/.agents/skills/ora-skilld/SKILL.md",
        patterns,
      ),
    ).toBe(false);
  });

  test("a single star does not cross directory boundaries", () => {
    expect(matchesPathPatterns("docs/a/b.md", ["docs/*.md"])).toBe(false);
    expect(matchesPathPatterns("docs/b.md", ["docs/*.md"])).toBe(true);
  });

  test("double star crosses directory boundaries", () => {
    expect(matchesPathPatterns("docs/a/b/c.md", ["docs/**/*.md"])).toBe(true);
    expect(matchesPathPatterns("src/x/y.ts", ["src/**"])).toBe(true);
  });

  test("a leading slash anchors like gitignore and is otherwise ignored", () => {
    expect(matchesPathPatterns("bun.lock", ["/bun.lock"])).toBe(true);
    expect(matchesPathPatterns("sub/bun.lock", ["/bun.lock"])).toBe(false);
  });

  test("a trailing slash means 'this directory and its contents'", () => {
    expect(matchesPathPatterns("dist/index.js", ["dist/"])).toBe(true);
    expect(matchesPathPatterns("dist", ["dist/"])).toBe(true);
    expect(matchesPathPatterns("dist.txt", ["dist/"])).toBe(false);
  });
});

describe("matchesPathPatterns - bare patterns (no slash)", () => {
  test("match a file's basename at any depth", () => {
    expect(matchesPathPatterns("bun.lock", ["bun.lock"])).toBe(true);
    expect(matchesPathPatterns("packages/app/bun.lock", ["bun.lock"])).toBe(
      true,
    );
    expect(matchesPathPatterns("sub/dir/yarn.lock", ["*.lock"])).toBe(true);
  });

  test("match a directory name at any depth, covering its contents", () => {
    expect(
      matchesPathPatterns(".agents/skills/ora-skilld/SKILL.md", ["*-skilld"]),
    ).toBe(true);
    expect(matchesPathPatterns("a/node_modules/x/y.js", ["node_modules"])).toBe(
      true,
    );
  });

  test("do not match partial segments", () => {
    expect(matchesPathPatterns("bun.lockb", ["bun.lock"])).toBe(false);
    expect(matchesPathPatterns("mybun.lock", ["bun.lock"])).toBe(false);
  });
});

describe("matchesPathPatterns - normalisation and edge cases", () => {
  test("strips a leading ./ or / from the path", () => {
    expect(matchesPathPatterns("./bun.lock", ["bun.lock"])).toBe(true);
    expect(matchesPathPatterns("/bun.lock", ["bun.lock"])).toBe(true);
    expect(matchesPathPatterns("./dist/x.js", ["dist/**"])).toBe(true);
  });

  test("a literal backslash in a path is a filename character, not a separator", () => {
    // Git always emits `/` separators, so a backslash only ever arrives as
    // part of a (POSIX) filename and must not split it into segments.
    expect(matchesPathPatterns("weird\\name.txt", ["name.txt"])).toBe(false);
    expect(matchesPathPatterns("dist\\x.js", ["dist/**"])).toBe(false);
  });

  test("strips a leading ./ from a pattern too", () => {
    expect(matchesPathPatterns("bun.lock", ["./bun.lock"])).toBe(true);
    expect(matchesPathPatterns("dist/x.js", ["./dist/**"])).toBe(true);
    expect(matchesPathPatterns("sub/bun.lock", ["./bun.lock"])).toBe(false);
  });

  test("a slash anywhere in a brace group anchors every alternative", () => {
    // Documented limitation: anchoring is decided on the whole pattern text.
    const pattern = ["{docs/**,bun.lock}"];
    expect(matchesPathPatterns("docs/a.md", pattern)).toBe(true);
    expect(matchesPathPatterns("bun.lock", pattern)).toBe(true);
    expect(matchesPathPatterns("sub/bun.lock", pattern)).toBe(false);
  });

  test("an empty pattern list matches nothing", () => {
    expect(matchesPathPatterns("bun.lock", [])).toBe(false);
  });

  test("an empty path matches nothing", () => {
    expect(matchesPathPatterns("", ["**"])).toBe(false);
  });

  test("blank patterns are ignored rather than matching everything", () => {
    expect(matchesPathPatterns("src/index.ts", ["", "   "])).toBe(false);
  });

  test("any one of several patterns is enough", () => {
    const patterns = ["bun.lock", "dist/**"];
    expect(matchesPathPatterns("src/index.ts", patterns)).toBe(false);
    expect(matchesPathPatterns("dist/index.js", patterns)).toBe(true);
    expect(matchesPathPatterns("bun.lock", patterns)).toBe(true);
  });

  test("brace expansion works", () => {
    expect(matchesPathPatterns("a.lock", ["*.{lock,lockb}"])).toBe(true);
    expect(matchesPathPatterns("a.lockb", ["*.{lock,lockb}"])).toBe(true);
  });
});

describe("matchesPathPatterns - negation", () => {
  test("a leading ! re-includes paths matched by an earlier pattern", () => {
    const patterns = ["docs/**", "!docs/adr/**"];
    expect(matchesPathPatterns("docs/guide.md", patterns)).toBe(true);
    expect(matchesPathPatterns("docs/adr/0001.md", patterns)).toBe(false);
  });

  test("the last matching pattern wins, so order matters", () => {
    expect(
      matchesPathPatterns("docs/adr/x.md", ["!docs/adr/**", "docs/**"]),
    ).toBe(true);
  });

  test("negation works against bare patterns", () => {
    const patterns = ["node_modules", "!a/node_modules/keep.md"];
    expect(matchesPathPatterns("a/node_modules/x.js", patterns)).toBe(true);
    expect(matchesPathPatterns("a/node_modules/keep.md", patterns)).toBe(false);
  });

  test("a list of only negations matches nothing", () => {
    expect(matchesPathPatterns("docs/x.md", ["!docs/**"])).toBe(false);
  });

  test("a bare ! or blank negation is ignored", () => {
    expect(matchesPathPatterns("docs/x.md", ["docs/**", "!", "! "])).toBe(true);
  });

  test("a backslash escapes a literal leading bang", () => {
    expect(matchesPathPatterns("!weird.lock", ["\\!weird.lock"])).toBe(true);
    expect(matchesPathPatterns("weird.lock", ["\\!weird.lock"])).toBe(false);
  });
});

describe("createPathMatcher", () => {
  test("returns a reusable predicate with the same semantics", () => {
    const matches = createPathMatcher([".agents/skills/*-skilld"]);
    expect(matches(".agents/skills/ora-skilld/SKILL.md")).toBe(true);
    expect(matches("src/index.ts")).toBe(false);
  });

  test("with no patterns, never matches", () => {
    const matches = createPathMatcher([]);
    expect(matches("anything")).toBe(false);
  });
});

describe("matchesPathPatterns - ill-formed patterns are parsed, not rejected", () => {
  // Bun.Glob never throws, but it does not reliably match nothing either:
  // these pin the real behaviour so a Bun upgrade cannot silently change
  // how a typo in the config classifies a diff.
  test("an unbalanced brace group becomes its first alternative", () => {
    expect(matchesPathPatterns("docs/guide.md", ["{docs,build"])).toBe(true);
    expect(matchesPathPatterns("src/docs/util.ts", ["{docs,build"])).toBe(true);
    expect(matchesPathPatterns("build/out.js", ["{docs,build"])).toBe(false);
  });

  test("an unterminated character class matches nothing, not even its literal text", () => {
    expect(matchesPathPatterns("[abc", ["[abc"])).toBe(false);
    expect(matchesPathPatterns("[abc", ["\\[abc"])).toBe(true);
  });

  test("an ill-formed pattern never throws", () => {
    expect(() =>
      matchesPathPatterns("x", ["[z-a]", "{{{", "\\", "**/[!]"]),
    ).not.toThrow();
  });
});
