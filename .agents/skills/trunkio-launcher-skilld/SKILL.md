---
name: trunkio-launcher-skilld
description: 'ALWAYS use when writing code importing "@trunkio/launcher". Consult for debugging, best practices, or modifying @trunkio/launcher, trunkio/launcher, trunkio launcher.'
metadata:
  version: 1.3.4
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-01
---

# @trunkio/launcher@1.3.4

**Tags:** latest: 1.3.4

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md)

## Search

Use `skilld search "query" -p @trunkio/launcher` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @trunkio/launcher` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

@trunkio/launcher is a CLI bootstrap tool, not a library with versioned public APIs. It serves as a minimal npm wrapper that downloads and runs the Trunk CLI binary for the pinned version in your trunk.yaml configuration.

**No documented public APIs or version-specific changes.** The launcher itself has no exported functions, classes, or composables — it's invoked exclusively via the `trunk` CLI command. Version changes in the launcher reflect underlying Trunk CLI binary updates, not API surface changes.

**For Trunk CLI feature changes**, consult the [changelog](./changelog.md) in the Trunk platform documentation, which tracks new features, fixes, and deprecations in the Trunk product itself (merge queue, flaky tests, etc.).
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Commit `.trunk/trunk.yaml` to version control with pinned CLI version — ensures all developers and CI use the same Trunk version, eliminating "works on my machine" issues with linters and formatters [source](./.skilld/pkg-launcher/README.md:L116-122)

- Store SHA256 checksums in `.trunk/trunk.yaml` under `cli.sha256.<platform>` — enables security verification of downloaded Trunk binaries before execution [source](./.skilld/pkg/src/version.js:L228-229)

- Use `TRUNK_CLI_VERSION` environment variable to override pinned version only in exceptional circumstances — allows temporary version testing without committing changes, but defaults to `.trunk/trunk.yaml` for reproducibility [source](./.skilld/pkg/src/version.js:L63-68)

- Configure `TRUNK_CACHE` environment variable to use a shared cache directory on CI systems — reduces repeated binary downloads across parallel CI jobs and improves pipeline speed [source](./.skilld/pkg/src/download.js:L197-209)

- Verify binary integrity after download by checking SHA256 sum — protects against corrupted downloads or man-in-the-middle attacks during CI runs [source](./.skilld/pkg/src/download.js:L315-330)

- Run `trunk upgrade` in a dedicated commit to bump version in `.trunk/trunk.yaml` — keeps version changes visible in git history and allows the team to review Trunk version updates separately [source](./.skilld/pkg-launcher/README.md:L123-127)

- Place `.trunk/trunk.yaml` at repo root and search directory trees from project subdirectories — enables Trunk to work correctly in monorepos and nested project structures [source](./.skilld/pkg/src/version.js:L99-116)

- Rely on automatic platform detection for binary downloads — the launcher handles downloading the correct prebuilt binary for macOS, Linux, and Windows without manual configuration [source](./.skilld/pkg/src/download.js:L231-237)

- Forward all CLI arguments directly to the Trunk executable — ensures the launcher is transparent and supports all Trunk CLI features without wrapper overhead [source](./.skilld/pkg/trunk.js:L316-318)

- Use the launcher as a drop-in replacement for a native Trunk installation — no additional configuration needed beyond installing `@trunkio/launcher` via npm and setting up `.trunk/trunk.yaml` [source](./.skilld/pkg-launcher/README.md:L34-39)

- Leverage automatic caching in `~/.cache/trunk` (or `XDG_CACHE_HOME/trunk`) — cached binaries are reused across multiple runs and projects, reducing disk I/O and network traffic [source](./.skilld/pkg/src/download.js:L197-209)

- Validate `.trunk/trunk.yaml` syntax with a YAML parser when committing — prevents silent failures if YAML is malformed, since parsing errors will only occur during Trunk execution [source](./.skilld/pkg/src/version.js:L182-185)

- Never commit `.trunk/tools` or cache directories — these contain downloaded binaries and should be regenerated per environment, not checked into version control [source](./.skilld/pkg/src/download.js:L210-213)

<!-- /skilld:best-practices -->
