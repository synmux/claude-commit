import { test, expect, describe, afterEach } from "bun:test";
import {
  buildChatRequest,
  normaliseOllamaHost,
  probeOllamaContext,
  resolveOllamaConfig,
  resolveOllamaContext,
  resolveOllamaHost,
  runOllamaPrompt,
} from "../src/ollama";
import { ClaudeCommitError, isPromptTooLongError } from "../src/errors";
import type { OllamaConfig, RunPromptOptions } from "../src/types";

const ollama: OllamaConfig = {
  host: "http://ollama.test:11434",
  context: 8192,
  keepAlive: null,
};

const baseOpts = (over: Partial<RunPromptOptions> = {}): RunPromptOptions => ({
  model: "ollama:gemma4:e2b-it-qat",
  system: "Be terse.",
  ollama,
  ...over,
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Capture the single request the code under test makes, and reply with `respond`. */
function stubFetch(respond: () => Response): { calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    return respond();
  }) as unknown as typeof fetch;
  return { calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** An NDJSON body delivered as the given raw byte slices, to test framing. */
function ndjsonResponse(parts: Array<string | Uint8Array>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(
          typeof part === "string" ? encoder.encode(part) : part,
        );
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

const doneLine = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: "gemma4:e2b-it-qat",
    message: { role: "assistant", content: "" },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 120,
    eval_count: 8,
    ...over,
  }) + "\n";

describe("normaliseOllamaHost", () => {
  test("leaves a full URL alone", () => {
    expect(normaliseOllamaHost("http://localhost:11434")).toBe(
      "http://localhost:11434",
    );
    expect(normaliseOllamaHost("https://ollama.example.com")).toBe(
      "https://ollama.example.com",
    );
  });

  test("adds a scheme to Ollama's own bare host:port form", () => {
    expect(normaliseOllamaHost("127.0.0.1:11434")).toBe(
      "http://127.0.0.1:11434",
    );
    expect(normaliseOllamaHost("box.local:11434")).toBe(
      "http://box.local:11434",
    );
  });

  test("strips trailing slashes so paths do not double up", () => {
    expect(normaliseOllamaHost("http://localhost:11434/")).toBe(
      "http://localhost:11434",
    );
    expect(normaliseOllamaHost("http://localhost:11434///")).toBe(
      "http://localhost:11434",
    );
  });

  test("falls back to the default for an empty value", () => {
    expect(normaliseOllamaHost("   ")).toBe("http://localhost:11434");
  });
});

describe("resolveOllamaHost", () => {
  test("prefers the configured host", () => {
    expect(
      resolveOllamaHost("http://configured:1234", {
        OLLAMA_HOST: "http://from-env:9999",
      }),
    ).toBe("http://configured:1234");
  });

  test("falls back to OLLAMA_HOST", () => {
    expect(resolveOllamaHost(undefined, { OLLAMA_HOST: "box:11434" })).toBe(
      "http://box:11434",
    );
  });

  test("falls back to the default when neither is set", () => {
    expect(resolveOllamaHost(undefined, {})).toBe("http://localhost:11434");
  });

  test("treats a blank configured host as unset", () => {
    expect(resolveOllamaHost("  ", { OLLAMA_HOST: "http://env:1" })).toBe(
      "http://env:1",
    );
  });
});

describe("resolveOllamaConfig", () => {
  test("fills every default when given nothing - and the default asks the server", () => {
    expect(resolveOllamaConfig(undefined, {})).toEqual({
      host: "http://localhost:11434",
      context: "auto",
      keepAlive: null,
    });
  });

  test("a nonsense context length falls back to asking rather than guessing", () => {
    expect(resolveOllamaConfig({ context: 0 }, {}).context).toBe("auto");
    expect(resolveOllamaConfig({ context: -5 }, {}).context).toBe("auto");
  });

  test("a pinned number stays pinned", () => {
    expect(resolveOllamaConfig({ context: 65536 }, {}).context).toBe(65536);
  });

  test("keeps a keepAlive of either accepted shape", () => {
    expect(resolveOllamaConfig({ keepAlive: "10m" }, {}).keepAlive).toBe("10m");
    expect(resolveOllamaConfig({ keepAlive: 0 }, {}).keepAlive).toBe(0);
  });
});

describe("buildChatRequest", () => {
  const resolved = { host: ollama.host, contextTokens: 8192, keepAlive: null };

  test("sends the model name without cco's prefix", () => {
    const body = buildChatRequest("diff", baseOpts(), resolved);
    expect(body.model).toBe("gemma4:e2b-it-qat");
  });

  test("puts the system prompt and the prompt in separate messages", () => {
    const body = buildChatRequest("the diff", baseOpts(), resolved);
    expect(body.messages).toEqual([
      { role: "system", content: "Be terse." },
      { role: "user", content: "the diff" },
    ]);
  });

  test("always pins num_ctx, because the server default is silent truncation", () => {
    const body = buildChatRequest("d", baseOpts(), resolved);
    expect(body.options.num_ctx).toBe(8192);
  });

  test("puts temperature inside options, where Ollama actually reads it", () => {
    const body = buildChatRequest(
      "d",
      baseOpts({ temperature: 0.7 }),
      resolved,
    );
    expect(body.options.temperature).toBe(0.7);
    expect(body).not.toHaveProperty("temperature");
  });

  test("omits temperature entirely when none was asked for", () => {
    const body = buildChatRequest("d", baseOpts(), resolved);
    expect(body.options).not.toHaveProperty("temperature");
  });

  test("maps a JSON-schema output format onto `format`", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    const body = buildChatRequest(
      "d",
      baseOpts({ outputFormat: { type: "json_schema", schema } }),
      resolved,
    );
    expect(body.format).toEqual(schema);
  });

  test("streams only when a text callback is watching", () => {
    expect(buildChatRequest("d", baseOpts(), resolved).stream).toBe(false);
    expect(
      buildChatRequest("d", baseOpts({ onText: () => {} }), resolved).stream,
    ).toBe(true);
  });

  test("sends keep_alive only when configured", () => {
    expect(buildChatRequest("d", baseOpts(), resolved)).not.toHaveProperty(
      "keep_alive",
    );
    expect(
      buildChatRequest("d", baseOpts(), { ...resolved, keepAlive: "10m" })
        .keep_alive,
    ).toBe("10m");
  });

  test("never asks for thinking, which models disagree about", () => {
    expect(buildChatRequest("d", baseOpts(), resolved)).not.toHaveProperty(
      "think",
    );
  });
});

describe("runOllamaPrompt - non-streaming", () => {
  test("returns the message content, trimmed, at zero cost", async () => {
    stubFetch(() =>
      jsonResponse({
        model: "gemma4:e2b-it-qat",
        message: { role: "assistant", content: "  Add a thing\n" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 100,
      }),
    );
    const result = await runOllamaPrompt("diff", baseOpts());
    expect(result.text).toBe("Add a thing");
    expect(result.costUsd).toBe(0);
    expect(result.model).toBe("gemma4:e2b-it-qat");
  });

  test("posts to /api/chat on the configured host", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      urls.push(url);
      expect(init.method).toBe("POST");
      return jsonResponse({
        message: { content: "ok" },
        done: true,
        done_reason: "stop",
      });
    }) as unknown as typeof fetch;
    await runOllamaPrompt("diff", baseOpts());
    expect(urls).toEqual(["http://ollama.test:11434/api/chat"]);
  });

  test("parses structured output out of the JSON content", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: '{"messages":["Fix the parser"]}' },
        done: true,
        done_reason: "stop",
      }),
    );
    const result = await runOllamaPrompt(
      "diff",
      baseOpts({
        outputFormat: { type: "json_schema", schema: { type: "object" } },
      }),
    );
    expect(result.structured).toEqual({ messages: ["Fix the parser"] });
  });

  test("leaves structured unset when the model ignored the schema", async () => {
    // Ollama Cloud does not support `format` at all; the caller's fallback
    // chain depends on this being a soft failure rather than a throw.
    stubFetch(() =>
      jsonResponse({
        message: { content: "Sorry, here is prose instead." },
        done: true,
        done_reason: "stop",
      }),
    );
    const result = await runOllamaPrompt(
      "diff",
      baseOpts({
        outputFormat: { type: "json_schema", schema: { type: "object" } },
      }),
    );
    expect(result.structured).toBeUndefined();
    expect(result.text).toBe("Sorry, here is prose instead.");
  });

  test("rejects an empty reply rather than returning a blank message", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: "   " },
        done: true,
        done_reason: "stop",
      }),
    );
    expect(runOllamaPrompt("diff", baseOpts())).rejects.toThrow(
      /returned no text/,
    );
  });

  test("discards any thinking the model volunteered", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: "Add a thing", thinking: "Let me consider..." },
        done: true,
        done_reason: "stop",
      }),
    );
    const result = await runOllamaPrompt("diff", baseOpts());
    expect(result.text).toBe("Add a thing");
  });
});

describe("runOllamaPrompt - silent truncation", () => {
  test("treats a prompt that filled the window as an overflow the pipeline can retry", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: "A summary of half the diff" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 8192, // exactly num_ctx: Ollama dropped the rest
      }),
    );
    const error = await runOllamaPrompt("diff", baseOpts()).catch((e) => e);
    expect(error).toBeInstanceOf(ClaudeCommitError);
    // The wording matters: this is what triggers halve-and-re-split.
    expect(isPromptTooLongError(error)).toBe(true);
  });

  test("uses the larger of the two prompt counters", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: "summary" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 12,
        prompt_eval_cached_count: 8192,
      }),
    );
    expect(
      isPromptTooLongError(
        await runOllamaPrompt("d", baseOpts()).catch((e) => e),
      ),
    ).toBe(true);
  });

  test("leaves a comfortably-sized prompt alone", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: "summary" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 8191,
      }),
    );
    expect((await runOllamaPrompt("d", baseOpts())).text).toBe("summary");
  });

  test("does not guess when the server reported no counts", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: "summary" },
        done: true,
        done_reason: "stop",
      }),
    );
    expect((await runOllamaPrompt("d", baseOpts())).text).toBe("summary");
  });

  test("reports a reply cut off at the limit", async () => {
    stubFetch(() =>
      jsonResponse({
        message: { content: "Add a thi" },
        done: true,
        done_reason: "length",
        prompt_eval_count: 100,
      }),
    );
    expect(runOllamaPrompt("d", baseOpts())).rejects.toThrow(/cut off/);
  });
});

describe("runOllamaPrompt - streaming", () => {
  test("forwards each delta and returns the concatenation", async () => {
    const deltas: string[] = [];
    stubFetch(() =>
      ndjsonResponse([
        JSON.stringify({ message: { content: "Add " }, done: false }) + "\n",
        JSON.stringify({ message: { content: "a thing" }, done: false }) + "\n",
        doneLine(),
      ]),
    );
    const result = await runOllamaPrompt(
      "diff",
      baseOpts({ onText: (d) => deltas.push(d) }),
    );
    expect(deltas).toEqual(["Add ", "a thing"]);
    expect(result.text).toBe("Add a thing");
  });

  test("reassembles records split across network reads", async () => {
    const line =
      JSON.stringify({ message: { content: "Hello" }, done: false }) + "\n";
    stubFetch(() =>
      ndjsonResponse([line.slice(0, 12), line.slice(12), doneLine()]),
    );
    const result = await runOllamaPrompt("d", baseOpts({ onText: () => {} }));
    expect(result.text).toBe("Hello");
  });

  test("reassembles a UTF-8 sequence split across network reads", async () => {
    const line =
      JSON.stringify({ message: { content: "café ☕" }, done: false }) + "\n";
    const bytes = new TextEncoder().encode(line);
    const cut = bytes.indexOf(0xe2); // mid-way through the ☕ code point
    stubFetch(() =>
      ndjsonResponse([
        bytes.slice(0, cut + 1),
        bytes.slice(cut + 1),
        doneLine(),
      ]),
    );
    const result = await runOllamaPrompt("d", baseOpts({ onText: () => {} }));
    expect(result.text).toBe("café ☕");
  });

  test("handles a final line with no trailing newline", async () => {
    stubFetch(() =>
      ndjsonResponse([
        JSON.stringify({ message: { content: "Hi" }, done: false }) + "\n",
        doneLine().trimEnd(),
      ]),
    );
    expect(
      (await runOllamaPrompt("d", baseOpts({ onText: () => {} }))).text,
    ).toBe("Hi");
  });

  test("raises an error that arrived after the 200", async () => {
    stubFetch(() =>
      ndjsonResponse([
        JSON.stringify({ message: { content: "Add " }, done: false }) + "\n",
        JSON.stringify({ error: "model runner has crashed" }) + "\n",
      ]),
    );
    expect(
      runOllamaPrompt("d", baseOpts({ onText: () => {} })),
    ).rejects.toThrow(/model runner has crashed/);
  });

  test("refuses a stream that stopped before the model finished", async () => {
    stubFetch(() =>
      ndjsonResponse([
        JSON.stringify({ message: { content: "Add " }, done: false }) + "\n",
      ]),
    );
    expect(
      runOllamaPrompt("d", baseOpts({ onText: () => {} })),
    ).rejects.toThrow(/ended before the model finished/);
  });

  test("refuses a malformed line rather than skipping it", async () => {
    stubFetch(() => ndjsonResponse(["{not json at all}\n", doneLine()]));
    expect(
      runOllamaPrompt("d", baseOpts({ onText: () => {} })),
    ).rejects.toThrow(/malformed response line/);
  });

  test("still detects truncation on a streamed run", async () => {
    stubFetch(() =>
      ndjsonResponse([
        JSON.stringify({
          message: { content: "half a summary" },
          done: false,
        }) + "\n",
        doneLine({ prompt_eval_count: 8192 }),
      ]),
    );
    const error = await runOllamaPrompt(
      "d",
      baseOpts({ onText: () => {} }),
    ).catch((e) => e);
    expect(isPromptTooLongError(error)).toBe(true);
  });
});

describe("runOllamaPrompt - failures", () => {
  test("says how to start a server that is not there", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Unable to connect. ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(runOllamaPrompt("d", baseOpts())).rejects.toThrow(
      /Cannot reach the Ollama server at http:\/\/ollama\.test:11434.*ollama serve/s,
    );
  });

  test("says how to pull a missing model, and does not pull it", async () => {
    stubFetch(() => jsonResponse({ error: "model not found" }, 404));
    expect(runOllamaPrompt("d", baseOpts())).rejects.toThrow(
      /ollama pull gemma4:e2b-it-qat/,
    );
  });

  test("passes a 400's detail through", async () => {
    stubFetch(() =>
      jsonResponse(
        { error: "registry.ollama.ai/library/x does not support tools" },
        400,
      ),
    );
    expect(runOllamaPrompt("d", baseOpts())).rejects.toThrow(
      /does not support tools/,
    );
  });

  test("points a 500 at the memory knob that usually causes it", async () => {
    stubFetch(() => jsonResponse({ error: "llama runner terminated" }, 500));
    expect(runOllamaPrompt("d", baseOpts())).rejects.toThrow(/ollama\.context/);
  });

  test("reports an unexpected status rather than hiding it", async () => {
    stubFetch(() => jsonResponse({}, 418));
    expect(runOllamaPrompt("d", baseOpts())).rejects.toThrow(/returned 418/);
  });

  test("reports a cancelled run as a cancellation", async () => {
    const abortController = new AbortController();
    globalThis.fetch = (async () => {
      abortController.abort();
      throw new Error("The operation was aborted.");
    }) as unknown as typeof fetch;
    expect(runOllamaPrompt("d", baseOpts({ abortController }))).rejects.toThrow(
      /cancelled/,
    );
  });

  test("rejects a model name with nothing after the prefix", async () => {
    expect(
      runOllamaPrompt("d", baseOpts({ model: "ollama:" })),
    ).rejects.toThrow(/names no Ollama model/);
  });
});

/** A stub server: a preload that succeeds, and a `ps` listing the given models. */
function stubProbeServer(
  loaded: Array<Record<string, unknown>>,
  preloadStatus = 200,
): { requests: Array<{ url: string; body?: unknown }> } {
  const requests: Array<{ url: string; body?: unknown }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({
      url,
      ...(init.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (url.endsWith("/api/chat")) {
      return jsonResponse(
        preloadStatus === 200
          ? { model: "gemma4:e2b-it-qat", done: true, done_reason: "load" }
          : { error: "model not found" },
        preloadStatus,
      );
    }
    if (url.endsWith("/api/ps")) return jsonResponse({ models: loaded });
    return jsonResponse({}, 500);
  }) as unknown as typeof fetch;
  return { requests };
}

describe("probeOllamaContext", () => {
  const settings = { host: "http://ollama.test:11434", keepAlive: null };

  test("preloads without a num_ctx so the server makes its own choice", async () => {
    const { requests } = stubProbeServer([
      {
        name: "gemma4:e2b-it-qat",
        model: "gemma4:e2b-it-qat",
        context_length: 131072,
      },
    ]);
    await probeOllamaContext("gemma4:e2b-it-qat", settings);
    const preload = requests[0]!;
    expect(preload.url).toBe("http://ollama.test:11434/api/chat");
    expect(preload.body).toMatchObject({
      model: "gemma4:e2b-it-qat",
      messages: [],
    });
    // The whole point: no options.num_ctx on the preload.
    expect((preload.body as { options?: unknown }).options).toBeUndefined();
  });

  test("reads the window the server picked from /api/ps", async () => {
    stubProbeServer([
      { name: "other:latest", context_length: 4096 },
      {
        name: "gemma4:e2b-it-qat",
        model: "gemma4:e2b-it-qat",
        context_length: 131072,
      },
    ]);
    expect(await probeOllamaContext("gemma4:e2b-it-qat", settings)).toBe(
      131072,
    );
  });

  test("passes keep_alive through so the preload does not evict early", async () => {
    const { requests } = stubProbeServer([
      { name: "gemma4:e2b-it-qat", context_length: 32768 },
    ]);
    await probeOllamaContext("gemma4:e2b-it-qat", {
      ...settings,
      keepAlive: "10m",
    });
    expect(requests[0]!.body).toMatchObject({ keep_alive: "10m" });
  });

  test("fails loudly when the model is not in ps afterwards", async () => {
    stubProbeServer([{ name: "something-else:7b", context_length: 4096 }]);
    expect(probeOllamaContext("gemma4:e2b-it-qat", settings)).rejects.toThrow(
      /did not report its context window.*ollama\.context/s,
    );
  });

  test("fails loudly when ps has no context_length for it", async () => {
    stubProbeServer([{ name: "gemma4:e2b-it-qat" }]);
    expect(probeOllamaContext("gemma4:e2b-it-qat", settings)).rejects.toThrow(
      /did not report its context window/,
    );
  });

  test("surfaces a missing model from the preload as the pull hint", async () => {
    stubProbeServer([], 404);
    expect(probeOllamaContext("gemma4:e2b-it-qat", settings)).rejects.toThrow(
      /ollama pull gemma4:e2b-it-qat/,
    );
  });

  test("surfaces an unreachable server", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(probeOllamaContext("gemma4:e2b-it-qat", settings)).rejects.toThrow(
      /Cannot reach the Ollama server/,
    );
  });
});

describe("resolveOllamaContext", () => {
  test("a configured number needs no round trip", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    expect(
      await resolveOllamaContext("ollama:gemma4", {
        ...ollama,
        context: 16384,
      }),
    ).toBe(16384);
    expect(calls).toBe(0);
  });

  test("auto probes, using the name without cco's prefix", async () => {
    const { requests } = stubProbeServer([
      { name: "gemma4:e2b-it-qat", context_length: 131072 },
    ]);
    expect(
      await resolveOllamaContext("ollama:gemma4:e2b-it-qat", {
        ...ollama,
        context: "auto",
      }),
    ).toBe(131072);
    expect(requests[0]!.body).toMatchObject({ model: "gemma4:e2b-it-qat" });
  });
});

describe("runOllamaPrompt - auto context", () => {
  test("resolves auto itself and pins the answer on the real request", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      if (init.body) bodies.push(JSON.parse(String(init.body)));
      if (url.endsWith("/api/ps")) {
        return jsonResponse({
          models: [{ name: "gemma4:e2b-it-qat", context_length: 131072 }],
        });
      }
      const body = bodies[bodies.length - 1]!;
      const isPreload =
        Array.isArray(body.messages) && body.messages.length === 0;
      return jsonResponse(
        isPreload
          ? { done: true, done_reason: "load" }
          : {
              message: { content: "Add a thing" },
              done: true,
              done_reason: "stop",
              prompt_eval_count: 100,
            },
      );
    }) as unknown as typeof fetch;

    const result = await runOllamaPrompt(
      "diff",
      baseOpts({ ollama: { ...ollama, context: "auto" } }),
    );
    expect(result.text).toBe("Add a thing");
    const real = bodies.find(
      (b) => Array.isArray(b.messages) && b.messages.length > 0,
    )!;
    expect((real.options as { num_ctx: number }).num_ctx).toBe(131072);
  });

  test("the truncation check uses the probed window", async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      if (url.endsWith("/api/ps")) {
        return jsonResponse({
          models: [{ name: "gemma4:e2b-it-qat", context_length: 4096 }],
        });
      }
      const body = JSON.parse(String(init.body));
      return jsonResponse(
        body.messages.length === 0
          ? { done: true, done_reason: "load" }
          : {
              message: { content: "half" },
              done: true,
              done_reason: "stop",
              prompt_eval_count: 4096,
            },
      );
    }) as unknown as typeof fetch;
    const error = await runOllamaPrompt(
      "diff",
      baseOpts({ ollama: { ...ollama, context: "auto" } }),
    ).catch((e) => e);
    expect(isPromptTooLongError(error)).toBe(true);
    expect(error.message).toMatch(/4096-token/);
  });
});
