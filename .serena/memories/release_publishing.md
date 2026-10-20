# Release / npm publishing

Releases are automated by `.github/workflows/publish.yml` (added 2026-07-09, commit cac3038; moved to pnpm 2026-09-13).

## Flow

Bump `version` in package.json → commit → `git tag X.Y.Z` (bare semver, the repo convention; `v`-prefixed also accepted) → `git push --tags`. The workflow chains three jobs: `verify-tag` (tag == package.json version, optional `v` stripped) → `ci` (runs `ci.yml` as a reusable workflow: trunk, `pnpm run lint:types`, build, test, on Node 26) → `publish` (`actions/setup-node` 26, `pnpm/action-setup` with cache, `npm publish --access public`). `npm publish` triggers `prepublishOnly` = `pnpm run build`, which produces `dist/` (esbuild bundles + declaration tree); `files` ships `bin`, `dist`, `CHANGELOG.md`.

## Key constraints

- Auth is **npm trusted publishing (OIDC)** — no NPM_TOKEN secret anywhere. One-time setup required on npmjs.com: package Settings → Trusted Publisher → GitHub Actions, org `synmux`, repo `claude-commit`, workflow filename `publish.yml`, environment blank.
- The publish step uses **npm, not `pnpm publish`**: npm >= 11.5.1 (bundled with Node 24 and later) is the known-good OIDC path. setup-node must NOT set `registry-url` — it writes an .npmrc expecting NODE_AUTH_TOKEN, which breaks tokenless OIDC publishes.
- Actions in workflows are pinned to full commit SHAs with `# vX.Y.Z` comments; trunk's `pinact` linter enforces this. Pin the peeled commit SHA, not the annotated tag object's SHA.
- CI's `--frozen-lockfile` install also re-validates the lockfile against `minimumReleaseAge`; a lockfile that slipped a too-young package past the policy locally will fail CI.
- Package is scoped (`@synmux/claude-commit`), hence `--access public`. Versions 0.1.0–0.1.2 were published before this workflow existed; 1.0.4 is the last Bun-era release; the Node/pnpm/Clack migration shipped as 1.1.0 (2026-09-13). As of 2026-10-20 package.json says 1.2.0 but the latest tag and npm release are 1.1.0; `[Unreleased]` in CHANGELOG.md holds the TypeSafe check, the Node 26 requirement and the review bugfixes.
