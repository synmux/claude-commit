import { test, expect, describe } from "bun:test";
import {
  buildProgram,
  describeLowPriorityStats,
  flagsToConfig,
  resolveInteractiveMode,
} from "../src/cli";

describe("resolveInteractiveMode", () => {
  const base = {
    configInteractive: false,
    interactiveFlag: undefined as boolean | undefined,
    dryRun: false,
    hasTty: true,
  };

  test("stays non-interactive when nothing enables it", () => {
    expect(resolveInteractiveMode(base)).toBe("non-interactive");
  });

  test("config-enabled on a TTY runs the picker", () => {
    expect(resolveInteractiveMode({ ...base, configInteractive: true })).toBe(
      "interactive",
    );
  });

  test("an explicit -i flag on a TTY runs the picker", () => {
    // The flag is folded into config precedence before this point, so both are set.
    expect(
      resolveInteractiveMode({
        ...base,
        configInteractive: true,
        interactiveFlag: true,
      }),
    ).toBe("interactive");
  });

  test("--dry-run always wins, even with -i on a TTY", () => {
    expect(
      resolveInteractiveMode({
        configInteractive: true,
        interactiveFlag: true,
        dryRun: true,
        hasTty: true,
      }),
    ).toBe("non-interactive");
  });

  test("an explicit -i without a TTY is a hard error", () => {
    expect(
      resolveInteractiveMode({
        configInteractive: true,
        interactiveFlag: true,
        dryRun: false,
        hasTty: false,
      }),
    ).toBe("no-tty-error");
  });

  test("config-driven interactive without a TTY falls back quietly", () => {
    expect(
      resolveInteractiveMode({
        configInteractive: true,
        interactiveFlag: undefined,
        dryRun: false,
        hasTty: false,
      }),
    ).toBe("non-interactive");
  });

  test("--no-interactive (config resolved to false) skips the picker on a TTY", () => {
    expect(
      resolveInteractiveMode({
        configInteractive: false,
        interactiveFlag: false,
        dryRun: false,
        hasTty: true,
      }),
    ).toBe("non-interactive");
  });
});

describe("--no-low-priority-paths", () => {
  test("parses to lowPriorityPaths: false and maps to an empty list", () => {
    const program = buildProgram();
    program.parse(["--no-low-priority-paths"], { from: "user" });
    const opts = program.opts<{ lowPriorityPaths?: boolean }>();
    expect(opts.lowPriorityPaths).toBe(false);
    expect(flagsToConfig(opts).lowPriorityPaths).toEqual([]);
  });

  test("is left unset when the flag is absent", () => {
    const program = buildProgram();
    program.parse([], { from: "user" });
    const opts = program.opts<{ lowPriorityPaths?: boolean }>();
    expect(flagsToConfig(opts).lowPriorityPaths).toBeUndefined();
  });
});

describe("describeLowPriorityStats", () => {
  test("distinguishes none, some and all-promoted", () => {
    expect(
      describeLowPriorityStats({
        matchedFiles: 0,
        totalFiles: 3,
        promoted: false,
      }),
    ).toBe("low-priority paths: matched none of 3 files");
    expect(
      describeLowPriorityStats({
        matchedFiles: 2,
        totalFiles: 3,
        promoted: false,
      }),
    ).toBe("low-priority paths: matched 2 of 3 files");
    expect(
      describeLowPriorityStats({
        matchedFiles: 1,
        totalFiles: 1,
        promoted: true,
      }),
    ).toBe(
      "low-priority paths: matched all 1 file - nothing else changed, so treated as primary",
    );
  });
});
