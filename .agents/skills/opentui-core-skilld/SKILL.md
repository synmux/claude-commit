---
name: opentui-core-skilld
description: 'ALWAYS use when writing code importing "@opentui/core". Consult for debugging, best practices, or modifying @opentui/core, opentui/core, opentui core, opentui.'
metadata:
  version: 0.4.5
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-23
---

# anomalyco/opentui `@opentui/core@0.4.5`

**Tags:** snapshot: 0.0.0-20260717-4e811d28, latest: 0.4.5

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @opentui/core` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @opentui/core` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritise recent major/minor releases. OpenTUI v0.4.x is the current stable branch; v0.3.0 introduced architectural changes that remain in effect.

- BREAKING: `LayoutEvent.ADDED` and `LayoutEvent.REMOVED` — removed in v0.4.3 as unused, replaced with child lifecycle management via identity-based methods [source](./.skilld/releases/v0.4.3.md:L16)

- BREAKING: Link slot management — v0.4.0 retires slots after generation exhaustion, changing behaviour of generator-based links; code relying on slot persistence must now manage lifecycle explicitly [source](./.skilld/releases/v0.4.0.md:L14)

- NEW: `NativeSpanFeed` — v0.3.0 feature routing renderer output through custom stdout, enabling integration with external output streams for observability and custom rendering pipelines [source](./.skilld/releases/v0.3.0.md:L17)

- NEW: `DiffRenderable.getHunkRowOffsets()` — v0.3.2 method for querying hunk boundaries in diff views, supports programmatic navigation and synchronisation with external hunk data [source](./.skilld/releases/v0.3.2.md:L13)

- NEW: Markdown code block renderer helper — v0.3.2 utility for rendering custom code block handlers in markdown, enables syntax-aware rendering and language-specific transformations [source](./.skilld/releases/v0.3.2.md:L14)

- NEW: `Box` component `titleColor` prop — v0.3.3 styling option for box title text, allows independent colouring of titles from box borders and background [source](./.skilld/releases/v0.3.3.md:L11)

- NEW: `QrCodeRenderable` — v0.2.15 component for rendering QR codes in terminal UI, generates scannable codes with configurable error correction [source](./.skilld/releases/v0.2.15.md:L14)

- NEW: `InputRenderable` `minLength` prop — v0.2.16 validation constraint enforcing minimum input length before submission, integrates with input validation pipeline [source](./.skilld/releases/v0.2.16.md:L18)

- NEW: `@opentui/ssh` package — v0.4.1 dedicated SSH integration module, provides terminal session management over SSH with full OpenTUI renderable support [source](./.skilld/releases/v0.4.1.md:L14)

- NEW: MP3 and FLAC audio streaming — v0.4.4 codec support in audio subsystem, extends `AudioStreamDemuxer` to handle MP3/FLAC streams alongside existing formats [source](./.skilld/releases/v0.4.4.md:L13)

- ARCHITECTURAL: Native Yoga layout integration — v0.4.1 replaced JavaScript layout computation with native Zig-based Yoga, improves performance but requires validation of custom layout plugins [source](./.skilld/releases/v0.4.1.md:L16)

- ARCHITECTURAL: Node.js 26 support — v0.4.0 extends runtime compatibility to Node.js 26 alongside Bun; pre-built binaries now include Node 26 runtime assets [source](./.skilld/releases/v0.4.0.md:L13)

**Also changed:** `useTimeline` autoplay condition corrected v0.4.4 · `TextBuffer` style preservation on listener failure v0.4.0 · Grapheme pool slot lifetime handling v0.3.3 · Remote shell detection v0.3.0 · Terminal UI renderer scroll position v0.4.2
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use `createTestRenderer()` for isolated terminal UI testing instead of integrating with real terminals — provides a controlled test environment with width/height configuration and frame capture [source](./.skilld/docs/src/testing/README.md#L8:L21)

- Apply modifiers to keyboard input using the modifiers object (`ctrl`, `shift`, `meta`) for comprehensive input testing — supports arrow keys, special keys, and modifier combinations [source](./.skilld/docs/src/testing/README.md#L47:L65)

- Set `OPENTUI_FORCE_EXPLICIT_WIDTH=false` as an environment variable or in code before renderer creation for terminals lacking OSC 66 support — prevents garbled artifacts on GNOME Terminal, Konsole, xterm and similar [source](./.skilld/development.md#L108:L145)

- Use `TestRecorder` to capture and debug frame-by-frame rendering during development — records timestamps and frame numbers for analysis of rendering behavior [source](./.skilld/docs/src/testing/README.md#L150:L183)

- Call `setRendererCapabilities()` to override terminal capability detection when testing specific terminal features — enables testing of kitty keyboard, notifications, and other features independently [source](./.skilld/docs/src/testing/README.md#L25:L30)

- Inspect the terminal startup flow to understand palette detection timing — async capability responses continue after `setupTerminal()` resolves, and palette detection uses hard + idle timeouts [source](./.skilld/docs/src/specs/terminal-startup.md#L1:L30)

- Forward environment variables explicitly in remote sessions via `forwardEnvKeys` to enable proper terminal capability detection — remote auto-detection relies on SSH environment variables, not the remote process environment [source](./.skilld/docs/src/specs/terminal-startup.md#L54:L62)

- Use `createMockMouse()` with button constants (`LEFT`, `MIDDLE`, `RIGHT`, wheel variants) and modifiers for realistic mouse interaction testing [source](./.skilld/docs/src/testing/README.md#L84:L127)

- Route custom stdout through `NativeSpanFeed` for applications that need to redirect renderer output — introduced in v0.3.0 to support custom stdout handling [source](./.skilld/releases/v0.3.0.md#L17)

- Structure renderables hierarchically using composition — renderables can be positioned, nested, styled and mounted into parent containers as a tree structure [source](./.skilld/docs/src/renderables/composition/README.md#L1:L9)

- Use identity-based child management for renderables to prevent duplicate-id culling corruption — fixed in v0.4.3 to ensure stable child references [source](./.skilld/releases/v0.4.3.md#L17)

- Only disable terminal setup on non-compliant terminals if necessary — the native terminal initialization auto-detects remote sessions and determines capabilities, avoiding unnecessary manual configuration [source](./.skilld/docs/src/specs/terminal-startup.md#L8:L14)

- Expect `PALETTE` events only when palette detection completes and the normalized palette signature differs from prior emissions — palette detection uses both hard and idle timeouts to optimize responsiveness [source](./.skilld/docs/src/specs/terminal-startup.md#L42:L46)

- Use `createSpy()` for callback testing in renderables — provides `callCount()`, `calledWith()`, `calls` array, and `reset()` for simple function mocking [source](./.skilld/docs/src/testing/README.md#L128:L145)

<!-- /skilld:best-practices -->
