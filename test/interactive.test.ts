import { test, expect, describe } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import * as tui from "@opentui/core";
import { buildPickerScene, pickerHeight } from "../src/ui/interactive";

describe("pickerHeight", () => {
  test("sizes to two rows per candidate", () => {
    expect(pickerHeight(1, 40)).toBe(2);
    expect(pickerHeight(3, 40)).toBe(6);
    expect(pickerHeight(5, 40)).toBe(10);
  });

  test("never collapses to zero, even for a zero count", () => {
    expect(pickerHeight(0, 40)).toBe(2);
  });

  test("caps to the terminal (minus chrome) when options overflow, flooring at one item", () => {
    expect(pickerHeight(8, 14)).toBe(10); // wanted 16, capped to 14 - 4
    expect(pickerHeight(8, 10)).toBe(6); // wanted 16, capped to 10 - 4
    expect(pickerHeight(5, 5)).toBe(2); // tiny terminal floors at one item
  });
});

describe("buildPickerScene", () => {
  const messages = [
    "feat(alpha): first candidate subject line\n\nBody one preview.",
    "fix(bravo): second candidate subject line\n\nBody two preview.",
    "refactor(charlie): third candidate subject line\n\nBody three preview.",
  ];

  async function renderScene(width: number, height: number, msgs: string[]) {
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer(
      {
        width,
        height,
      },
    );
    const scene = buildPickerScene(renderer, tui, msgs, height);
    renderer.root.add(scene.root);
    await renderOnce();
    const frame = captureCharFrame();
    try {
      renderer.destroy();
    } catch {
      /* headless teardown is best-effort */
    }
    return { scene, frame };
  }

  const subject = (message: string): string => message.split("\n", 1)[0]!;

  test("lists every candidate message", async () => {
    const { scene, frame } = await renderScene(120, 40, messages);
    expect(scene.select.height).toBeGreaterThanOrEqual(messages.length * 2);
    for (const message of messages) {
      expect(frame).toContain(subject(message));
    }
  });

  test("shows only the options — no diff pane", async () => {
    const { frame } = await renderScene(120, 40, messages);
    expect(frame).not.toContain("Staged diff");
    expect(frame).not.toContain("scroll diff");
  });

  test("keeps the picker visible on a small terminal", async () => {
    const { scene, frame } = await renderScene(80, 12, messages);
    expect(scene.select.height).toBeGreaterThanOrEqual(2);
    expect(frame).toContain(subject(messages[0]!));
  });

  test("renders a single candidate at two rows", async () => {
    const { scene, frame } = await renderScene(80, 24, [
      "feat: the only option here\n\nJust one body.",
    ]);
    expect(scene.select.height).toBe(2);
    expect(frame).toContain("feat: the only option here");
  });

  test("caps height and scrolls when there are more options than fit", async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => `feat: candidate option number ${i + 1}\n\nBody ${i + 1}.`,
    );
    const { scene } = await renderScene(80, 16, many);
    // 12 options want 24 rows, but a 16-row terminal caps to 16 - 4 = 12.
    expect(scene.select.height).toBe(12);
    expect(scene.select.height).toBeLessThan(many.length * 2);
  });
});
