import { test, expect, describe } from "bun:test";
import { buildSubprocessEnv, presentCredentialVars } from "../src/agent";

const cleanEnv = { PATH: "/usr/bin", HOME: "/home/user" };

describe("presentCredentialVars", () => {
  test("returns an empty list when no credential vars are set", () => {
    expect(presentCredentialVars(cleanEnv)).toEqual([]);
  });

  test("lists every credential var that is present", () => {
    expect(
      presentCredentialVars({ ...cleanEnv, ANTHROPIC_API_KEY: "sk-test" }),
    ).toEqual(["ANTHROPIC_API_KEY"]);
    expect(
      presentCredentialVars({
        ...cleanEnv,
        ANTHROPIC_API_KEY: "sk-test",
        ANTHROPIC_AUTH_TOKEN: "token",
      }),
    ).toEqual(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]);
  });

  test("counts an empty string as present", () => {
    expect(
      presentCredentialVars({ ...cleanEnv, ANTHROPIC_AUTH_TOKEN: "" }),
    ).toEqual(["ANTHROPIC_AUTH_TOKEN"]);
  });

  test("treats explicit undefined values as absent", () => {
    expect(
      presentCredentialVars({ ...cleanEnv, ANTHROPIC_API_KEY: undefined }),
    ).toEqual([]);
  });
});

describe("buildSubprocessEnv", () => {
  test("inherits the parent env when there is nothing to change", () => {
    expect(
      buildSubprocessEnv({ baseEnv: cleanEnv, allowApiKey: false }),
    ).toBeUndefined();
    expect(
      buildSubprocessEnv({
        baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: "sk-test" },
        allowApiKey: true,
      }),
    ).toBeUndefined();
  });

  test("strips ANTHROPIC_API_KEY when the gate is off", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: "sk-test" },
      allowApiKey: false,
    });
    expect(env).toBeDefined();
    expect(Object.keys(env!)).not.toContain("ANTHROPIC_API_KEY");
    expect(env!.PATH).toBe("/usr/bin");
  });

  test("strips ANTHROPIC_AUTH_TOKEN when the gate is off", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_AUTH_TOKEN: "token" },
      allowApiKey: false,
    });
    expect(Object.keys(env!)).not.toContain("ANTHROPIC_AUTH_TOKEN");
  });

  test("strips credentials that are set to an empty string", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: "" },
      allowApiKey: false,
    });
    expect(Object.keys(env!)).not.toContain("ANTHROPIC_API_KEY");
  });

  test("defaults to stripping when allowApiKey is omitted", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: "sk-test" },
    });
    expect(Object.keys(env!)).not.toContain("ANTHROPIC_API_KEY");
  });

  test("passes credentials through when the gate is on", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: "sk-test" },
      allowApiKey: true,
      temperature: 1, // forces an env to be built so passthrough is observable
    });
    expect(env!.ANTHROPIC_API_KEY).toBe("sk-test");
  });

  test("injects the temperature via CLAUDE_CODE_EXTRA_BODY", () => {
    const env = buildSubprocessEnv({
      baseEnv: cleanEnv,
      allowApiKey: false,
      temperature: 0.8,
    });
    expect(JSON.parse(env!.CLAUDE_CODE_EXTRA_BODY!)).toEqual({
      temperature: 0.8,
    });
  });

  test("merges the temperature over an existing extra body", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, CLAUDE_CODE_EXTRA_BODY: '{"foo":1}' },
      allowApiKey: false,
      temperature: 0.5,
    });
    expect(JSON.parse(env!.CLAUDE_CODE_EXTRA_BODY!)).toEqual({
      foo: 1,
      temperature: 0.5,
    });
  });

  test("ignores a malformed existing extra body", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, CLAUDE_CODE_EXTRA_BODY: "{oops" },
      allowApiKey: false,
      temperature: 0.5,
    });
    expect(JSON.parse(env!.CLAUDE_CODE_EXTRA_BODY!)).toEqual({
      temperature: 0.5,
    });
  });

  test("combines credential stripping with the temperature override", () => {
    const env = buildSubprocessEnv({
      baseEnv: { ...cleanEnv, ANTHROPIC_API_KEY: "sk-test" },
      allowApiKey: false,
      temperature: 1.2,
    });
    expect(Object.keys(env!)).not.toContain("ANTHROPIC_API_KEY");
    expect(JSON.parse(env!.CLAUDE_CODE_EXTRA_BODY!)).toEqual({
      temperature: 1.2,
    });
  });

  test("does not mutate the base environment", () => {
    const baseEnv = { ...cleanEnv, ANTHROPIC_API_KEY: "sk-test" };
    buildSubprocessEnv({ baseEnv, allowApiKey: false, temperature: 0.5 });
    expect(baseEnv.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(Object.keys(baseEnv)).not.toContain("CLAUDE_CODE_EXTRA_BODY");
  });
});
