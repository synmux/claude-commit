# Release / npm publishing

Releases are automated by `.github/workflows/publish.yml` (added 2026-07-09, commit cac3038).

## Flow

Bump `version` in package.json → commit → `git tag 0.x.y` (bare semver, the repo convention; `v`-prefixed also accepted) → `git push --tags`. The workflow then: verifies tag == package.json version (strips optional `v`), `bun install --frozen-lockfile`, `bun test`, `bun run typecheck`, `npm publish --access public`.

## Key constraints

- Auth is **npm trusted publishing (OIDC)** — no NPM_TOKEN secret anywhere. One-time setup required on npmjs.com: package Settings → Trusted Publisher → GitHub Actions, org `synmux`, repo `claude-commit`, workflow filename `publish.yml`, environment blank. Until that is configured, the publish step will fail with an auth error.
- The publish step uses **npm, not `bun publish`**: Bun has no OIDC trusted-publishing support (oven-sh/bun#22423). npm >= 11.5.1 needed → setup-node with node-version 24.
- setup-node must NOT set `registry-url` — it writes an .npmrc expecting NODE_AUTH_TOKEN, which breaks tokenless OIDC publishes.
- Actions in workflows are pinned to full commit SHAs with `# vX.Y.Z` comments; trunk's `pinact` linter enforces this.
- Package is scoped (`@synmux/claude-commit`), hence `--access public`. Versions 0.1.0–0.1.2 were published before this workflow existed.
