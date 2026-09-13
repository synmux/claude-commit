# Release / npm publishing

Releases are automated by `.github/workflows/publish.yml` (added 2026-07-09, commit cac3038; moved to pnpm 2026-09-13).

## Flow

Bump `version` in package.json → commit → `git tag 0.x.y` (bare semver, the repo convention; `v`-prefixed also accepted) → `git push --tags`. The workflow then: verifies tag == package.json version (strips optional `v`), `pnpm/action-setup` (reads `packageManager`), `actions/setup-node` 24 with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run typecheck`, `npm publish --access public`. `npm publish` triggers `prepublishOnly` = `pnpm run build`, which produces `dist/` (esbuild bundles + declaration tree); `files` ships `bin`, `dist`, `CHANGELOG.md`.

## Key constraints

- Auth is **npm trusted publishing (OIDC)** — no NPM_TOKEN secret anywhere. One-time setup required on npmjs.com: package Settings → Trusted Publisher → GitHub Actions, org `synmux`, repo `claude-commit`, workflow filename `publish.yml`, environment blank.
- The publish step uses **npm, not `pnpm publish`**: npm >= 11.5.1 (Node 24) is the known-good OIDC path. setup-node must NOT set `registry-url` — it writes an .npmrc expecting NODE_AUTH_TOKEN, which breaks tokenless OIDC publishes.
- Actions in workflows are pinned to full commit SHAs with `# vX.Y.Z` comments; trunk's `pinact` linter enforces this. pnpm/action-setup v4.2.0 = `41ff72655975bd51cab0327fa583b6e92b6d3061` (peeled commit, not the tag object).
- CI's `--frozen-lockfile` install also re-validates the lockfile against `minimumReleaseAge`; a lockfile that slipped a too-young package past the policy locally will fail CI.
- Package is scoped (`@synmux/claude-commit`), hence `--access public`. Versions 0.1.0–0.1.2 were published before this workflow existed; 1.0.4 is the last Bun-era release. The Node/pnpm/Clack migration (2026-09-13) sits under `[Unreleased]` in CHANGELOG.md and warrants a major bump.
