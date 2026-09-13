---
name: types-node-skilld
description: "ALWAYS use when writing code importing \"@types/node\". Consult for debugging, best practices, or modifying @types/node, types/node, types node, DefinitelyTyped."
metadata:
  version: 24.13.3
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-09-13
---

# DefinitelyTyped/DefinitelyTyped `@types/node@24.13.3`
**Tags:** ts2.4: 12.12.6, ts2.6: 12.12.6, ts2.0: 12.12.6

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Issues](./.skilld/issues/_INDEX.md) • [Discussions](./.skilld/discussions/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @types/node` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @types/node` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes in @types/node v24.x.

NEW: `crypto.encapsulate()` — new in v24.7.0, performs key encapsulation using KEM algorithms (RSA-RSASVE, DHKEM with curves, ML-KEM variants) [source](./.skilld/pkg/crypto.d.ts:L3900)

NEW: `crypto.decapsulate()` — new in v24.7.0, decapsulates ciphertext using a private key [source](./.skilld/pkg/crypto.d.ts:L3859)

NEW: `sqlite3` module — new in v24.0.0, provides built-in SQLite database support without external dependencies [source](./.skilld/pkg/sqlite.d.ts:L90)

NEW: `sqlite3.DatabaseSync` class — new in v24.0.0, synchronous SQLite database interface [source](./.skilld/pkg/sqlite.d.ts:L272)

NEW: `sqlite3.DatabaseSync.aggregate()` — new in v24.0.0, registers custom aggregate functions [source](./.skilld/pkg/sqlite.d.ts:L313)

NEW: `sql` template tag — new in v24.4.40, for parameterised SQLite queries [source](./.skilld/pkg/sqlite.d.ts:L117)

NEW: `assert.Assert` class — new in v24.6.0, allows creating independent assertion instances with custom options (diff, strict, skipPrototype) [source](./.skilld/pkg/assert.d.ts:L63)

NEW: `assert.doesNotMatch()` — new in v24.6.0, asserts value does not match regular expression [source](./.skilld/pkg/assert.d.ts:L123)

NEW: `assert.matchesRegExp()` — new in v24.9.0, asserts value matches regular expression [source](./.skilld/pkg/assert.d.ts:L50)

NEW: `http.ServerResponse.writableEnded` — new in v24.9.0, property indicating if response.end() has been called [source](./.skilld/pkg/http.d.ts:L350)

NEW: `http.ServerResponse.writableErrored` — new in v24.12.0, returns error if response failed to write [source](./.skilld/pkg/http.d.ts:L365)

NEW: `fs.Dir[Symbol.asyncDispose]()` — new in v24.1.0, supports async disposal protocol for directory handles [source](./.skilld/pkg/fs.d.ts:L329)

NEW: `fs.Dir[Symbol.dispose]()` — new in v24.1.0, supports synchronous disposal protocol for directory handles [source](./.skilld/pkg/fs.d.ts:L335)

NEW: `AsyncLocalStorage.name` property — new in v24.0.0, returns the name of the AsyncLocalStorage instance [source](./.skilld/pkg/async_hooks.d.ts:L450)

NEW: `X509Certificate.signatureAlgorithm` — new in v24.9.0, returns the algorithm used to sign certificate or undefined if unknown [source](./.skilld/pkg/crypto.d.ts:L4281)

NEW: `X509Certificate.signatureAlgorithmOid` — new in v24.9.0, returns the OID of the signature algorithm [source](./.skilld/pkg/crypto.d.ts:L4286)

NEW: `test.describe()` tags — new in v24.7.0, test grouping and lifecycle hooks (beforeEach, afterEach, before, after) [source](./.skilld/pkg/test.d.ts:L796)

NEW: `test.it()` tags — new in v24.7.0, test function with hooks support [source](./.skilld/pkg/test.d.ts:L838)

NEW: `test.it.only()` tags — new in v24.7.0, focused test execution [source](./.skilld/pkg/test.d.ts:L844)

**Also changed:** `dns.dnsPromises.ip()` new v23.9.0 · `url.URL.toJSON()` new v24.3.0 · `sea.getAsset()` new v24.8.0 · `module.register()` metadata v24.12.0 · `perf_hooks.PerformanceResourceTiming.deliveryType` new v24.12.0 · `net.Server.getConnections()` async callback v24.5.0 · `http2.ServerResponse` priority options v24.2.0 · `inspector.*` probe context v24.7.0 · `tls.SecureContext` options v24.5.0 · `util.transferableAbortSignal()` new v24.0.0 · `util.isShallowDeepStrictEqual()` new v24.9.0 · `util.parseEnv()` new v24.12.0 · `v8.writeHeapSnapshot()` serialiser v24.13.0 · `v8.GCProfiler.start()` v24.8.0 · `test.default.skip()` execution v24.3.0
<!-- /skilld:api-changes -->
