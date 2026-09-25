#!/usr/bin/env node
/**
 * Launcher for `cco` / `claude-commit`.
 *
 * The published package ships a bundled `dist/bin/cco.js` (Node refuses to
 * strip types from files under `node_modules`); a development checkout runs
 * the TypeScript entry directly through Node's native type stripping. Build
 * output wins when present, so `pnpm run build` is only ever needed for
 * publishing.
 */
import { existsSync } from 'node:fs'

const bundled = new URL('../dist/bin/cco.js', import.meta.url)
const source = new URL('./cco.ts', import.meta.url)

await import(existsSync(bundled) ? bundled.href : source.href)
