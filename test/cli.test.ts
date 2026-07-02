import { test, expect, describe } from "bun:test";
import { resolveInteractiveMode } from "../src/cli";

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
