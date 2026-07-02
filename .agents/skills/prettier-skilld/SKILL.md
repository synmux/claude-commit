---
name: prettier-skilld
description: 'Prettier is an opinionated code formatter. ALWAYS use when writing code importing "prettier". Consult for debugging, best practices, or modifying prettier.'
metadata:
  version: 3.9.4
  generated_by: cached
  generated_at: 2026-07-01
---

# prettier/prettier `prettier@3.9.4`

**Tags:** next: 4.0.0-alpha.13, latest: 3.9.4

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Discussions](./.skilld/discussions/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p prettier` instead of grepping `.skilld/` directories. Run `skilld search --guide -p prettier` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `parser` inference for `tsconfig.json` — now uses `"json"` instead of `"jsonc"` by default since v3.2.5, adding trailing commas. Override with `overrides` in `.prettierrc` if you need the old `"jsonc"` parser [source](./.skilld/releases/CHANGELOG.md:L763:L796)

- NEW: Plugin type definitions for `printers` export — v3.8.1 added explicit types for `Printer` objects accessed via `prettier/plugins/*` imports, replacing `any` types [source](./.skilld/releases/CHANGELOG.md:L107:L121)

- BREAKING: `module-sync` condition removed from `package.json` — v3.5.2 removed this export condition; `require("prettier")` now uses CommonJS version exclusively. ESM-only plugins no longer work via `require()` [source](./.skilld/releases/CHANGELOG.md:L367:L369)

- NEW: "Import Attributes" syntax support — v3.1.1 added support for TypeScript 5.3 import attributes: `import x from "./x.json" with { type: "json" }` [source](./.skilld/releases/CHANGELOG.md:L1016:L1022)

- BREAKING: `prettier.getFileInfo()` internal refactor — v3.7.3 fixed a regression that broke VSCode plugin loading when calling this API [source](./.skilld/releases/CHANGELOG.md:L193:L195)

- NEW: Plugin type definition for `printer.preprocess` — v3.0.1 added missing `Printer.preprocess?: (ast, options) => T | Promise<T>` type, required for AST preprocessing in custom plugins [source](./.skilld/releases/CHANGELOG.md:L1312:L1320)

- NEW: Plugin type definition for `printer.getVisitorKeys()` — v3.0.1 added explicit method signature to support custom AST traversal [source](./.skilld/releases/CHANGELOG.md:L1323:L1332)

- NEW: Improved typing for `AstPath.map()` — v3.0.1 added proper `readonly` array support to `AstPath` type parameter signatures, fixing TypeScript strictness [source](./.skilld/releases/CHANGELOG.md:L1334:L1365)

- NEW: Support for Angular v18 `@let` declaration — v3.3.3 added template variable syntax: `@let name = 'Frodo';` [source](./.skilld/releases/CHANGELOG.md:L571:L587)

- NEW: CLI option `--no-error-on-unmatched-pattern` — v3.1.1 allows skipping symbolic links without throwing errors [source](./.skilld/releases/CHANGELOG.md:L942:L946)

- FIXED: `cursorOffset` option compatibility — v3.1.1 clarified in docs that `cursorOffset` is compatible with `rangeStart`/`rangeEnd` (was incorrectly documented as incompatible) [source](./.skilld/releases/CHANGELOG.md:L1024:L1026)

- NEW: Support TypeScript 5.2 `using` / `await using` declarations — v3.0.3 added explicit resource management: `using foo = new Foo();` [source](./.skilld/releases/CHANGELOG.md:L1130:L1140)

- NEW: Support TypeScript 5.0 `const` type parameters — v2.8.5 added support for const modifiers in generics [source](./.skilld/releases/CHANGELOG.md:L1467:L1472)

- NEW: Support TypeScript 5.0 `export type *` declarations — v2.8.5 added type-only re-export syntax [source](./.skilld/releases/CHANGELOG.md:L1467:L1472)

- NEW: Angular v21.2 support with `@default never;` — v3.8.2 added exhaustive switch checking syntax in Angular templates [source](./.skilld/releases/CHANGELOG.md:L61:L81)

- FIXED: Plugin type export for `plugins/estree.d.ts` — v3.0.1 added `export {}` to make it a proper module, fixing TypeScript "File is not a module" error [source](./.skilld/releases/CHANGELOG.md:L1232:L1234)

**Also changed:** Support Vue 3.3 Generic Components (v3.0.1) · Support auto-accessors syntax (v2.8.1) · Parser inference for `tsconfig.json` — added `"jsonc"` detection in v3.2.3 (reverted v3.2.5) · Support Glimmer's named blocks (v2.5.1) · Allow decorators on private members (v2.8.6) · Allow multiple decorators on get/set accessors (v2.8.7)
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Prefer asynchronous APIs over synchronous ones — the main Prettier entry points are async for a reason, and `@prettier/sync` should only be used when synchronous operation is unavoidable [source](./.skilld/docs/api.md#prettier-format-source-options)

- Use `formatWithCursor` in editor integrations to preserve cursor position across formatting operations — translates unformatted cursor positions to formatted ones, preventing jarring jumps [source](./.skilld/docs/api.md#prettier-formatwithcursor-source--options-)

- Resolve config dynamically with `resolveConfig(filePath)` before formatting — reads the config tree from the file's directory upward, enabling per-directory configuration rules [source](./.skilld/docs/api.md#prettier-resolveconfig-fileurlora-path--options-)

- Use `getFileInfo(filePath)` to check if a file is ignored and which parser applies before attempting to format — prevents wasted processing on excluded files and reveals parser mismatches [source](./.skilld/docs/api.md#prettier-getfileinfo-fileurlora-path--options-)

- Never place `parser` at the top level of configuration — only use it inside `overrides` blocks; top-level parser disables automatic file-extension inference for all files [source](./.skilld/docs/configuration.md#setting-the-parser-option)

- Use `overrides` to apply different formatting rules based on file patterns, extensions, or directories — allows Prettier to enforce different styles for different parts of the codebase without multiple configs [source](./.skilld/docs/configuration.md#configuration-overrides)

- Import the `Config` type with type-only syntax in `.prettierrc.ts`: `import { type Config }` not `import { Config }` — type-only imports are erased at runtime, preventing module resolution errors [source](./.skilld/discussions/discussion-18472.md#accepted-answer)

- Declare plugins both in the `plugins` array and as `dependencies` in `package.json` when building shareable configs — ensures plugins are installed alongside the shared config and available to all consuming projects [source](./.skilld/docs/sharing-configurations.md#include-plugins-in-shareable-configurations)

- Use `eslint-config-prettier` to disable ESLint's conflicting stylistic rules — this is the recommended approach to coexist Prettier and ESLint without tool conflicts [source](./.skilld/docs/integrating-with-linters.md#notes)

- Avoid `eslint-plugin-prettier` and similar "run Prettier as a linter rule" plugins — slower than running Prettier directly, creates distracting editor squiggles, and adds unnecessary indirection [source](./.skilld/docs/integrating-with-linters.md#notes)

- Use `--ignore-unknown` flag when watching files with `onchange` or similar tools — skips processing files Prettier doesn't recognize, reducing unnecessary overhead [source](./.skilld/docs/watching-files.md#watching-for-changes)

- Pin Prettier to an exact version in CI/CD pipelines — ensures all developers and CI systems format code identically, preventing formatting drift and CI failures [source](./.skilld/docs/ci.md#github-actions)

- Understand that `printWidth` is a guide, not a hard limit — it specifies the preferred line length for readability, not a maximum like ESLint's `max-len`; Prettier will make both shorter and longer lines to optimize formatting [source](./.skilld/docs/options.md#print-width)

- Enable EditorConfig integration for cross-tool compatibility — Prettier reads `.editorconfig` files and converts them to Prettier config, allowing teams to use a single source of truth for indent style and width [source](./.skilld/docs/configuration.md#editorconfig)

<!-- /skilld:best-practices -->
