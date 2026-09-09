# `claude-commit` for Agents

## Architecture

`cco` reads a staged diff and writes a commit message in two model stages.
The pipeline lives in `src/generate.ts`; everything else feeds it.

```plaintext
git.ts ─▶ diff.ts (ignore, partition, chunk) ─▶ generate.ts ─▶ agent.ts ─▶ Claude | Ollama
                    ▲                                ▲
                paths.ts, tokens.ts             prompts.ts, config.ts
```

| Module          | Owns                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `src/agent.ts`  | `runPrompt` - the one call seam; dispatches by provider, holds Claude's SDK |
| `src/models.ts` | Model-string parsing: the `ollama:` prefix, Ollama defaults. No transport   |
| `src/ollama.ts` | Ollama's native `/api/chat` over plain `fetch`; no SDK dependency           |
| `src/diff.ts`   | Splitting, chunk packing, `applyIgnorePatterns`, `partitionDiff`            |
| `src/paths.ts`  | The gitignore-style matcher shared by `lowPriorityPaths` and `ignore`       |
| `src/tokens.ts` | Token estimation and context-window budgeting                               |
| `src/config.ts` | The layered config (defaults < global < package.json < project < flags)     |

Design records for each non-obvious feature live in
`docs/superpowers/specs/`. Read the relevant one before changing that
feature - they record what was rejected and why.

Two behaviours are load-bearing and easy to break:

- **Claude credentials are gated.** `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`
  are stripped from the SDK subprocess unless `allowApiKey` is set. Never
  widen that by accident.
- **Ollama truncates an oversized prompt silently.** Every Ollama request
  pins `options.num_ctx` and the response's token counts are checked against
  it. Do not "simplify" either half away.

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

<!-- skilld -->

Before modifying code, evaluate each installed skill against the current task.
For each skill, determine YES/NO relevance and invoke all YES skills before proceeding.

<!-- /skilld -->
