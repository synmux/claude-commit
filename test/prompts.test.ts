import { test, expect, describe } from "bun:test";
import {
  buildFinalSystem,
  buildFinalUser,
  buildSummaryUser,
  cleanMessage,
  parseOptions,
  OPTION_DELIMITER,
} from "../src/prompts";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config";

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
    const user = buildFinalUser(["did a thing"], 1);
    expect(user).toContain("did a thing");
    expect(user).not.toContain(OPTION_DELIMITER);
  });

  test("multiple options request includes the delimiter and count", () => {
    const user = buildFinalUser(["did a thing"], 3);
    expect(user).toContain("exactly 3 distinct");
    expect(user).toContain(OPTION_DELIMITER);
  });

  test("multiple summaries are labelled by part", () => {
    const user = buildFinalUser(["first", "second"], 1);
    expect(user).toContain("Part 1:");
    expect(user).toContain("Part 2:");
  });
});

describe("buildSummaryUser", () => {
  test("notes multi-part diffs", () => {
    expect(buildSummaryUser("d", 0, 1)).toContain(
      "Summarize the following diff",
    );
    expect(buildSummaryUser("d", 1, 3)).toContain("part 2 of 3");
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
