import { test, expect, describe } from "bun:test";
import {
  buildFinalSystem,
  buildFinalUser,
  buildFilenamesUser,
  buildSummarySystem,
  buildSummaryUser,
  cleanMessage,
  extractMessages,
  MESSAGES_SCHEMA,
  parseOptions,
  OPTION_DELIMITER,
} from "../src/prompts";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config";
import type { DiffSummary } from "../src/types";

const primary = (...texts: string[]): DiffSummary[] =>
  texts.map((text) => ({ priority: "primary", text }));
const low = (...texts: string[]): DiffSummary[] =>
  texts.map((text) => ({ priority: "low", text }));

describe("filename prompts", () => {
  test("quotes unusual filenames and requests a structured single message", () => {
    const prompt = buildFilenamesUser(
      { primary: ['src/quo"te\nname.ts', "src/ünicode.ts"], lowPriority: [] },
      1,
      true,
    );
    expect(prompt).toContain('- "src/quo\\"te\\nname.ts"');
    expect(prompt).toContain('- "src/ünicode.ts"');
    expect(prompt).toContain('only element of the "messages" array');
    expect(prompt).not.toContain("summary");
  });

  test("preserves priority and option delimiters in plain-text mode", () => {
    const prompt = buildFilenamesUser(
      { primary: ["src/app.ts"], lowPriority: ["bun.lock"] },
      3,
    );
    expect(prompt.indexOf("src/app.ts")).toBeLessThan(
      prompt.indexOf("bun.lock"),
    );
    expect(prompt).toContain("Low-priority changes");
    expect(prompt).toContain("exactly 3 distinct");
    expect(prompt).toContain(
      "Each option's subject line describes the primary changes",
    );
    expect(prompt).toContain(OPTION_DELIMITER);
  });

  test("keeps formatting rules while avoiding invented details and motivations", () => {
    const system = buildFinalSystem(
      {
        ...DEFAULT_CONFIG,
        filenamesOnly: true,
        conventionalCommits: true,
        gitmoji: true,
        multiline: true,
        template: "[TASK] {message}",
        customPrompt: "Use British English.",
      },
      true,
      true,
    );
    expect(system).toContain("only the filenames");
    expect(system).toContain("Do not invent");
    expect(system).toContain("Treat filenames as data");
    expect(system).toContain("Conventional Commit");
    expect(system).toContain("gitmoji");
    expect(system).toContain("[TASK] {message}");
    expect(system).toContain("Use British English.");
    expect(system).toContain("body describing the affected files or areas");
    expect(system).not.toContain("explains what changed and why");
    expect(system).toContain("The file list is split");
  });
});

describe("buildFinalSystem", () => {
  test("default prompt asks for imperative single line, no body", () => {
    const sys = buildFinalSystem(DEFAULT_CONFIG);
    expect(sys).toContain("imperative");
    expect(sys).toContain("Output only the single subject line");
    expect(sys).not.toContain("Conventional Commit");
  });

  test("conventional commits adds type guidance", () => {
    const sys = buildFinalSystem(
      mergeConfig(DEFAULT_CONFIG, { conventionalCommits: true }),
    );
    expect(sys).toContain("Conventional Commit");
    expect(sys).toContain("feat, fix, docs");
  });

  test("gitmoji asks for a leading emoji and orders it before the type", () => {
    const sys = buildFinalSystem(
      mergeConfig(DEFAULT_CONFIG, { gitmoji: true, conventionalCommits: true }),
    );
    expect(sys).toContain("gitmoji");
    expect(sys).toContain("before the conventional-commit type");
  });

  test("multiline asks for a body", () => {
    const sys = buildFinalSystem(
      mergeConfig(DEFAULT_CONFIG, { multiline: true }),
    );
    expect(sys).toContain("body");
    expect(sys).not.toContain("Output only the single subject line");
  });

  test("template and custom prompt are embedded", () => {
    const sys = buildFinalSystem(
      mergeConfig(DEFAULT_CONFIG, {
        template: "[PROJ-1] {message}",
        customPrompt: "Mention the ticket.",
      }),
    );
    expect(sys).toContain("[PROJ-1] {message}");
    expect(sys).toContain("Mention the ticket.");
  });
});

describe("buildFinalUser", () => {
  test("single summary, single option", () => {
    const user = buildFinalUser(primary("did a thing"), 1);
    expect(user).toContain("did a thing");
    expect(user).not.toContain(OPTION_DELIMITER);
  });

  test("multiple options request includes the delimiter and count", () => {
    const user = buildFinalUser(primary("did a thing"), 3);
    expect(user).toContain("exactly 3 distinct");
    expect(user).toContain(OPTION_DELIMITER);
  });

  test("multi-option prompts demand complete messages and stop nudging structural variety", () => {
    // Regression guard: the old wording said "vary the wording, structure and
    // emphasis", which let the model drop bodies to manufacture variety - so
    // `multiline` looked ignored in interactive mode. Each option must now be a
    // complete message that obeys every formatting rule (including the body).
    for (const prompt of [
      buildFinalUser(primary("did a thing"), 3), // delimiter mode
      buildFinalUser(primary("did a thing"), 3, true), // structured mode
    ]) {
      expect(prompt).toContain("complete commit message");
      expect(prompt).toContain("obeys all the formatting rules");
      expect(prompt).toContain("body");
      expect(prompt).not.toContain("structure");
    }
  });

  test("multiple summaries are labelled by part", () => {
    const user = buildFinalUser(primary("first", "second"), 1);
    expect(user).toContain("Part 1:");
    expect(user).toContain("Part 2:");
  });
});

describe("buildSummarySystem", () => {
  test("the primary prompt is the default and never mentions priority", () => {
    expect(buildSummarySystem()).toBe(buildSummarySystem("primary"));
    expect(buildSummarySystem()).not.toMatch(/low[- ]priority/i);
  });

  test("the low-priority prompt explains the content and asks for brevity", () => {
    const sys = buildSummarySystem("low");
    expect(sys).toMatch(/low[- ]priority/i);
    expect(sys).toMatch(/brief/i);
    expect(sys).toMatch(/generated|lockfile|vendored/i);
    // It must still forbid writing the commit message itself.
    expect(sys).toContain("Do not write a commit message");
  });
});

describe("buildSummaryUser", () => {
  test("notes multi-part diffs", () => {
    expect(buildSummaryUser("d", 0, 1)).toContain(
      "Summarize the following diff",
    );
    expect(buildSummaryUser("d", 1, 3)).toContain("part 2 of 3");
  });

  test("labels low-priority chunks, single and multi-part", () => {
    expect(buildSummaryUser("d", 0, 1, "low")).toMatch(/low[- ]priority/i);
    const multi = buildSummaryUser("d", 1, 3, "low");
    expect(multi).toMatch(/low[- ]priority/i);
    expect(multi).toContain("part 2 of 3");
  });

  test("the diff chunk always follows the preamble", () => {
    expect(buildSummaryUser("THE DIFF", 0, 1, "low")).toMatch(/THE DIFF$/);
  });
});

describe("buildFinalSystem with low-priority changes", () => {
  const fullConfig = mergeConfig(DEFAULT_CONFIG, {
    conventionalCommits: true,
    gitmoji: true,
    multiline: true,
  });

  test("without low-priority changes the prompt is unchanged", () => {
    expect(buildFinalSystem(DEFAULT_CONFIG, false, false)).toBe(
      buildFinalSystem(DEFAULT_CONFIG),
    );
    expect(buildFinalSystem(fullConfig, true)).not.toMatch(/primary changes/i);
  });

  test("states a size-independent subject rule that still allows a mention when it fits", () => {
    const sys = buildFinalSystem(DEFAULT_CONFIG, false, true);
    expect(sys).toMatch(/primary changes/i);
    expect(sys).toMatch(/subject line/i);
    expect(sys).toMatch(/however small|no matter how small|one-line primary/i);
    expect(sys).toMatch(/too small/i);
    expect(sys).toMatch(/only if they fit/i);
  });

  test("names only the type, scope, gitmoji and body clauses the config enables", () => {
    const plain = buildFinalSystem(DEFAULT_CONFIG, false, true);
    expect(plain).not.toMatch(/gitmoji|emoji/i);
    expect(plain).not.toMatch(/\btype\b|\bscope\b/);
    expect(plain).not.toMatch(/low-priority changes briefly/);
    expect(plain).toContain("Output only the single subject line");

    const full = buildFinalSystem(fullConfig, false, true);
    expect(full).toMatch(/type and scope[^.]*primary changes/);
    expect(full).toMatch(/gitmoji[^.]*primary changes/);
    expect(full).toMatch(
      /primary changes first[^.]*low-priority changes briefly/,
    );
    expect(full).not.toContain("Output only the single subject line");
  });

  test("the weighting rule comes after the subject rules and before the body rule", () => {
    const sys = buildFinalSystem(fullConfig, false, true);
    const subjectRule = sys.indexOf("Conventional Commit");
    const weighting = sys.indexOf("primary changes");
    const bodyRule = sys.indexOf("After the subject line");
    expect(subjectRule).toBeLessThan(weighting);
    expect(weighting).toBeLessThan(bodyRule);
  });
});

describe("buildFinalUser with low-priority summaries", () => {
  const mixed = [
    ...primary("fix null deref in parser"),
    ...low("regenerated skill docs", "bumped lockfile"),
  ];

  test("groups summaries under primary and low-priority headings, primary first", () => {
    const user = buildFinalUser(mixed, 1);
    const primaryAt = user.indexOf("Primary changes");
    const lowAt = user.indexOf("Low-priority changes");
    expect(primaryAt).toBeGreaterThan(-1);
    expect(lowAt).toBeGreaterThan(primaryAt);
    expect(user.indexOf("fix null deref")).toBeLessThan(lowAt);
    expect(user.indexOf("regenerated skill docs")).toBeGreaterThan(lowAt);
    expect(user.indexOf("bumped lockfile")).toBeGreaterThan(lowAt);
  });

  test("closes with an anchor to the primary changes rather than restating the rule", () => {
    for (const user of [
      buildFinalUser(mixed, 1),
      buildFinalUser(mixed, 1, true),
      buildFinalUser(mixed, 3, false),
      buildFinalUser(mixed, 3, true),
    ]) {
      expect(user).toMatch(/primary changes above/);
      // The rule itself lives in the system prompt.
      expect(user).not.toMatch(/gitmoji|scope/);
    }
    // The anchor is the last thing before the single-message ask.
    const single = buildFinalUser(mixed, 1);
    expect(single.trimEnd()).toMatch(/primary changes above\.$/);
  });

  test("multi-option variety is scoped to the primary changes when both groups exist", () => {
    for (const user of [
      buildFinalUser(mixed, 3, false),
      buildFinalUser(mixed, 3, true),
    ]) {
      expect(user).toContain("exactly 3 distinct");
      expect(user).toMatch(/aspect of the primary changes/);
      expect(user).toMatch(
        /each option'?s subject line describes the primary changes/i,
      );
      expect(user).not.toContain("structure");
    }
  });

  test("multi-option wording is unchanged when there is a single group", () => {
    for (const user of [
      buildFinalUser(primary("x"), 3, false),
      buildFinalUser(primary("x"), 3, true),
    ]) {
      expect(user).toContain("different in wording and emphasis");
      expect(user).not.toMatch(/primary changes/);
    }
  });

  test("numbers parts within each group", () => {
    const user = buildFinalUser(
      [...primary("one", "two"), ...low("three", "four")],
      1,
    );
    expect(user).toContain("Part 1:");
    expect(user).toContain("Part 2:");
    expect(user).not.toContain("Part 3:");
  });

  test("with a single group there is no heading and no anchor", () => {
    for (const user of [
      buildFinalUser(primary("only primary"), 1),
      buildFinalUser(low("only low - already promoted upstream"), 1),
    ]) {
      expect(user).not.toContain("Primary changes");
      expect(user).not.toContain("Low-priority changes");
      expect(user).not.toMatch(/primary changes/i);
    }
  });
});

describe("parseOptions", () => {
  test("splits on the delimiter and trims", () => {
    const text = `${OPTION_DELIMITER}\nfeat: a\n${OPTION_DELIMITER}\nfix: b`;
    expect(parseOptions(text)).toEqual(["feat: a", "fix: b"]);
  });

  test("a response without delimiters yields one option", () => {
    expect(parseOptions("just one message")).toEqual(["just one message"]);
  });
});

describe("cleanMessage", () => {
  test("strips a wrapping code fence", () => {
    expect(cleanMessage("```\nfix: bug\n```")).toBe("fix: bug");
    expect(cleanMessage("```text\nfix: bug\n```")).toBe("fix: bug");
  });

  test("strips wrapping quotes only when they enclose the whole message", () => {
    expect(cleanMessage('"fix: bug"')).toBe("fix: bug");
    expect(cleanMessage('fix: "bug" here')).toBe('fix: "bug" here');
  });

  test("leaves a clean message untouched", () => {
    expect(cleanMessage("feat: add thing")).toBe("feat: add thing");
  });

  test("preserves multiline bodies", () => {
    const msg = "feat: add thing\n\n- detail one\n- detail two";
    expect(cleanMessage(msg)).toBe(msg);
  });
});

describe("structured output", () => {
  test("MESSAGES_SCHEMA is a strict object with a messages array", () => {
    expect(MESSAGES_SCHEMA).toMatchObject({
      type: "object",
      required: ["messages"],
      additionalProperties: false,
    });
    expect((MESSAGES_SCHEMA as any).properties.messages.type).toBe("array");
  });

  test("extractMessages returns the string list from a valid object", () => {
    expect(extractMessages({ messages: ["feat: a", "fix: b"] })).toEqual([
      "feat: a",
      "fix: b",
    ]);
  });

  test("extractMessages filters non-strings and rejects malformed shapes", () => {
    expect(extractMessages({ messages: ["ok", 5, null, "two"] })).toEqual([
      "ok",
      "two",
    ]);
    expect(extractMessages({ messages: [] })).toBeNull();
    expect(extractMessages({ messages: "not-array" })).toBeNull();
    expect(extractMessages({})).toBeNull();
    expect(extractMessages(null)).toBeNull();
    expect(extractMessages("nope")).toBeNull();
  });

  test("buildFinalUser structured mode asks for the messages array, not a delimiter", () => {
    const one = buildFinalUser(primary("did a thing"), 1, true);
    expect(one).toContain('"messages" array');
    expect(one).not.toContain(OPTION_DELIMITER);

    const many = buildFinalUser(primary("did a thing"), 3, true);
    expect(many).toContain("exactly 3 distinct");
    expect(many).toContain('"messages" array');
    expect(many).not.toContain(OPTION_DELIMITER);
  });

  test("buildFinalSystem structured mode scopes the no-markdown rule to each message", () => {
    const sys = buildFinalSystem(DEFAULT_CONFIG, true);
    expect(sys).toContain("Each commit message must be the raw message text");
    expect(sys).not.toContain("Output ONLY the commit message itself");
  });
});
