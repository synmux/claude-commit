---
name: opentui-core-skilld
description: "ALWAYS use when writing code importing \"@opentui/core\". Consult for debugging, best practices, or modifying @opentui/core, opentui/core, opentui core, opentui."
metadata:
  version: 0.4.2
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-06-30
---

# anomalyco/opentui `@opentui/core@0.4.2`
**Tags:** latest: 0.4.2, snapshot: 0.0.0-20260616-38ae4bd9

**References:** [package.json](./.skilld/pkg/package.json) • [README](./.skilld/pkg/README.md) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p @opentui/core` instead of grepping `.skilld/` directories. Run `skilld search --guide -p @opentui/core` for full syntax, filters, and operators.

<!-- skilld:api-changes -->
## API Changes

This section documents version-specific API changes in @opentui/core v0.4.2 — prioritise recent major/minor releases when working with newer code.

### Recent Major Changes

- NEW: `DiffRenderable.getHunkRowOffsets()` — added in v0.3.2, returns `number[]` for navigating hunks in diffs [source](./.skilld/releases/v0.3.2.md#whats-changed:L13)

- NEW: `Box.titleColor` prop — added in v0.3.3, accepts `string | RGBA` to colour the box title independently of border colour [source](./.skilld/releases/v0.3.3.md#whats-changed:L11)

- NEW: `InputRenderable.minLength` prop — added in v0.2.16, sets minimum required input length validation [source](./.skilld/releases/v0.2.16.md#whats-changed:L18)

- BREAKING: `NativeSpanFeed` renderer output routing — v0.3.0 changed renderer output flow through `NativeSpanFeed` instead of direct output (see migration for custom stdout handling) [source](./.skilld/releases/v0.3.0.md#whats-changed:L17)

- NEW: `Yoga` layout engine exposed as native — v0.4.1 added native yoga-layout bindings (`export * as Yoga from "./yoga.js"`), replacing previous FFI approach [source](./.skilld/releases/v0.4.1.md#whats-changed:L16)

- NEW: `@opentui/ssh` package — added in v0.4.1 as a separate SSH integration package [source](./.skilld/releases/v0.4.1.md#whats-changed:L14)

### Minor Changes

- NEW: Code block renderer helper — added in v0.3.2 for markdown code block customisation (internal API) [source](./.skilld/releases/v0.3.2.md#whats-changed:L14)

- NEW: `split-footer replay reset` — added in v0.3.1 for renderer split-footer state management [source](./.skilld/releases/v0.3.1.md#whats-changed:L11)

- NEW: Node.js 26 support — v0.4.0 added native support for Node.js 26 runtime alongside Bun, improving runtime portability [source](./.skilld/releases/v0.4.0.md#whats-changed:L13)

- FIXED: Native event callbacks — v0.2.13 fixed `Fix OpenTUI native event callbacks`, addressing callback handling in native bindings [source](./.skilld/releases/v0.2.13.md#whats-changed:L13)

### Behaviour Changes

- Renderer output backpressure handling — v0.4.2 and v0.4.1 added threaded output backpressure and native render backpressure handling; code relying on synchronous renderer output may need adjustment [source](./.skilld/releases/v0.4.2.md#whats-changed:L11) [source](./.skilld/releases/v0.4.1.md#whats-changed:L15)

- Clipboard OSC 52 probing — v0.4.2 now probes `OSC 52` clipboard support at startup, changing clipboard availability detection [source](./.skilld/releases/v0.4.2.md#whats-changed:L13)

**Also changed:** QR code component in v0.2.15 · Shell detection (zellij, remote shells) in v0.3.0 · Markdown block spacing fixes across v0.2.x–v0.3.x · CJK text rendering fixes
<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->
## Best Practices

- Forward environment variables to renderer on remote sessions — `config.forwardEnvKeys` or explicit `config.remote` control over auto-detection. Without explicit forwarding, remote processes lose local terminal environment needed for capability heuristics [source](./.skilld/docs/src/specs/terminal-startup.md#current-gaps)

- Disable OSC 66 width detection for older terminal emulators — set `OPENTUI_FORCE_EXPLICIT_WIDTH=false` before renderer creation to avoid "66" artifacts on unsupported terminals (GNOME Terminal, older Konsole/xterm) [source](./.skilld/docs/development.md:L108:130)

- Use `createTestRenderer()` with explicit dimensions before adding renderables — test environment must be configured upfront with `width` and `height` so layout calculations match test assertions [source](./.skilld/docs/src/testing/README.md:L8:13)

- Capture test frames with explicit render cycles — call `renderOnce()` before `captureCharFrame()` to ensure pending renders complete; `Bun.sleep(1)` may be needed after mutations to trigger automatic renders [source](./.skilld/docs/src/testing/README.md:L160:168)

- Test mouse events with position validation — mock mouse calls expect (x, y) coordinates in terminal cells; use `getCurrentPosition()` to verify state before asserting clicks [source](./.skilld/docs/src/testing/README.md:L82:127)

- Track terminal capabilities during startup — palette detection and capability responses arrive asynchronously after renderer setup; listen for `CAPABILITIES` and `PALETTE` events to react to terminal features discovered after the 5000ms startup window [source](./.skilld/docs/src/specs/terminal-startup.md:L28:51)

- Set terminal capabilities in tests to simulate feature support — use `createTerminalCapabilities()` and `setRendererCapabilities()` to model Kitty keyboard, notifications, or other terminal features without a real terminal [source](./.skilld/docs/src/testing/README.md:L25:30)

- Record test frames programmatically for visual assertions — `TestRecorder` captures timestamped frames during interactive tests; use `rec()`, `stop()`, and `recordedFrames` to inspect rendering state across mutations [source](./.skilld/docs/src/testing/README.md:L149:200)

- Press keys with modifiers using the modifiers object — `pressKey("a", { ctrl: true })` and `pressArrow("left", { meta: true })` handle key+modifier combinations; separate calls do not preserve modifier state [source](./.skilld/docs/src/testing/README.md:L47:52)

- Type text with controlled delays between keystrokes — `typeText("hello", 10)` adds 10ms between each character; omit the delay for instant typing in tests [source](./.skilld/docs/src/testing/README.md:L40:41)

- Reset spy state between test cases — create spies with `createSpy()` and call `reset()` to clear call history when reusing the same spy instance across multiple assertions [source](./.skilld/docs/src/testing/README.md:L130:145)

- Use `renderables/composition` for hierarchical component trees — the composition model provides imperative tree building without reactivity; not a React replacement, but effective for programmatic UI assembly [source](./.skilld/docs/src/renderables/composition/README.md)

- Configure `bufferedOutput` for custom stdout routing — pass a `NativeBufferedOutput` to handle backpressure and capture output in non-terminal contexts (e.g., SSH or custom pipelines) [source](./.skilld/node_modules/@opentui/core/renderer.d.ts:L21)

- Listen for `FRAME` events to drive custom render loops — emit after native render completes; use `gatherStats: true` to collect frame timing data for performance profiling [source](./.skilld/node_modules/@opentui/core/renderer.d.ts:L72:74)
<!-- /skilld:best-practices -->
