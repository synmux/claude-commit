---
name: opentui-core-skilld
description: 'ALWAYS use when writing code importing "@opentui/core". Consult for debugging, best practices, or modifying @opentui/core, opentui/core, opentui core, opentui.'
metadata:
  version: 0.4.3
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-07-06
---

# anomalyco/opentui `@opentui/core@0.4.3`

**Tags:** latest: 0.4.3, snapshot: 0.0.0-20260705-2dee9667

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @opentui/core` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @opentui/core` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## API Changes

This section documents version-specific API changes — prioritise recent major/minor releases.

- NEW: `NativeSpanFeed` — v0.3.0 introduced routing of renderer output through NativeSpanFeed for custom stdout handling, allowing custom output streams and handlers [source](./.skilld/releases/v0.3.0.md)

- NEW: `DiffRenderable.getHunkRowOffsets()` — v0.3.2 added this method for hunk navigation in diff renderables [source](./.skilld/releases/v0.3.2.md)

- NEW: Code block renderer helper — v0.3.2 introduced markdown code block rendering helper for custom code block styling [source](./.skilld/releases/v0.3.2.md)

- NEW: `box.titleColor` prop — v0.3.3 added custom title colour property for box components, allowing separate styling from border colour [source](./.skilld/releases/v0.3.3.md)

- NEW: `@opentui/ssh` package — v0.4.1 introduced new package for SSH terminal integration support [source](./.skilld/releases/v0.4.1.md)

- NEW: Native yoga-layout — v0.4.1 switched to native yoga-layout integration for improved performance and layout correctness [source](./.skilld/releases/v0.4.1.md)

- NEW: Clipboard OSC 52 support — v0.4.2 added terminal clipboard access via OSC 52 sequence with automatic protocol detection [source](./.skilld/releases/v0.4.2.md)

- NEW: Render backpressure handling — v0.4.1 added native render backpressure and failure handling for threaded rendering [source](./.skilld/releases/v0.4.1.md)

- NEW: Node.js 26 support — v0.4.0 extended platform support to Node.js 26 alongside Bun [source](./.skilld/releases/v0.4.0.md)

**Also changed:** `InputRenderable.minLength` new v0.2.16 · QRCode component new v0.2.15 · `renderer.split-footer replay reset` new v0.3.1 · Text-buffer style preservation on listener failure improved v0.4.0 · Link retirement after generation exhaustion v0.4.0 · Scroll position and selection fixes v0.4.2
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Always use `createCliRenderer()` to initialize the renderer instead of directly instantiating CliRenderer, which automatically handles terminal setup, capability detection, and proper stream configuration [source](./.skilld/docs/src/specs/terminal-startup.md#terminal-startup-spec)

- Enable `live` mode on renderables that require continuous updates or respond to real-time events — omitting it prevents unnecessary frame scheduling and improves performance when components are static [source](./.skilld/pkg/Renderable.d.ts:L181-L183)

- Use `scrollViewportCulling` in ScrollBoxRenderable to automatically hide children outside the viewport, dramatically improving performance with large scrollable lists without manual visibility management [source](./.skilld/pkg/renderables/ScrollBox.d.ts:L31)

- Prefer BoxRenderable with Yoga flex layout over manual positioning — it handles responsive layouts, automatic spacing, and child constraints without the complexity of manual coordinate management [source](./.skilld/pkg/renderables/Box.d.ts#BoxOptions)

- Route renderer output through NativeSpanFeed when implementing custom stdout pipelines — zero-copy architecture and backpressure handling prevent buffering issues in high-throughput scenarios [source](./.skilld/pkg/NativeSpanFeed.d.ts:L8-L10)

- Use `TestRecorder` for behaviour-driven testing of TUI components — captures frame sequences during interactions, enabling assertions on visual state across render cycles [source](./.skilld/docs/src/testing/README.md:L148-L182)

- Set `OPENTUI_FORCE_EXPLICIT_WIDTH=false` if your terminal doesn't support OSC 66 (GNOME Terminal, older Konsole/xterm) before creating the renderer to avoid character width detection artifacts [source](./.skilld/docs/development.md:L108-L136)

- Use `buffered: true` on renderables with expensive render operations or complex nested children — frameBuffer caching defers full re-renders until the renderable is marked dirty [source](./.skilld/pkg/Renderable.d.ts:L132)

- Implement focus management with `focusable` and `focus()` methods rather than relying on tab order alone — manually routing focus enables complex interactions like modals and focus traps [source](./.skilld/pkg/Renderable.d.ts:L164-L178)

- Use `renderBefore()` and `renderAfter()` callbacks for post-processing effects and overlays on specific renderables without creating full wrapper components [source](./.skilld/pkg/Renderable.d.ts:L72-L73)

- Always call `createTestRenderer()` instead of CliRenderer in tests to use the in-memory renderer with mock input/output — allows synchronous testing and frame capture without terminal I/O [source](./.skilld/docs/src/testing/README.md:L7-L21)

- Compose interactive renderables by registering `onMouseDown`, `onMouseMove`, and `onMouseDragEnd` handlers separately instead of a catch-all `onMouse` handler — improves event routing clarity and allows different handlers to coexist [source](./.skilld/pkg/Renderable.d.ts:L74-L82)

- Use TextRenderable with StyledText for rich text rendering rather than plain strings — enables per-span colors, attributes, and composition without custom buffer management [source](./.skilld/pkg/renderables/Text.d.ts:L8-L11)

- Detect terminal capabilities before rendering heavy components by checking `TerminalCapabilities` (e.g., `kitty_graphics`, `sixel`) — avoids rendering unsupported features that degrade gracefully but waste CPU [source](./.skilld/pkg/types.d.ts:L53-L75)

<!-- /skilld:best-practices -->
