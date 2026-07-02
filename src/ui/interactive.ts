/**
 * Interactive mode: generate several candidate messages, then let the user pick
 * one (and optionally edit it) before committing.
 *
 * The picker is an OpenTUI selection screen. All key handling is driven through
 * the renderer's global key handler so there is a single source of truth for
 * navigation. If the TUI cannot be initialized for any reason, we transparently
 * fall back to a plain readline prompt.
 */
import { createInterface } from "node:readline";
import { commit } from "../git";
import { generateCommit } from "../generate";
import { Spinner } from "./spinner";
import { editInEditor } from "./editor";
import { color } from "./colors";
import type { Config } from "../types";

export interface InteractiveOptions {
  verbose: boolean;
  abortController: AbortController;
}

type Selection =
  { action: "commit" | "edit"; index: number } | { action: "cancel" };

/** Run the full interactive flow. Returns a process exit code. */
export async function runInteractive(
  diff: string,
  config: Config,
  opts: InteractiveOptions,
): Promise<number> {
  const count = Math.max(1, config.interactiveCount);
  const spinner = new Spinner(process.stderr.isTTY);
  spinner.start(`Generating ${count} option${count === 1 ? "" : "s"}`);
  let result;
  try {
    result = await generateCommit(diff, config, {
      count,
      progress: { onPhase: (label) => spinner.update(label) },
      abortController: opts.abortController,
    });
  } catch (err) {
    spinner.stop();
    throw err;
  }
  spinner.stop();

  const messages = result.messages;

  let selection: Selection;
  try {
    selection = await selectWithTui(messages);
  } catch {
    // TUI failed to initialize (unusual terminal, etc.) - degrade gracefully.
    selection = await selectWithReadline(messages);
  }

  if (selection.action === "cancel") {
    process.stderr.write("Aborted. Nothing was committed.\n");
    return 1;
  }

  let message = messages[selection.index]!;
  if (selection.action === "edit") {
    message = await editInEditor(message);
    if (message.trim() === "") {
      process.stderr.write("Aborted: empty commit message.\n");
      return 1;
    }
  }

  await commit(message);
  process.stderr.write(
    `${color("32", "✔")} Committed\n${color("90", firstLine(message))}\n`,
  );
  if (opts.verbose) {
    process.stderr.write(
      color("90", `cost $${result.costUsd.toFixed(4)}`) + "\n",
    );
  }
  return 0;
}

/**
 * Rows a single candidate occupies in the picker: the subject line plus a
 * one-line body preview (`showDescription`), with OpenTUI's default
 * `itemSpacing` of 0. Mirrors SelectRenderable's own line accounting.
 */
const PICKER_LINES_PER_ITEM = 2;

/**
 * Rows reserved for the non-picker chrome when capping its height: root padding
 * (2), the header line (1) and the gap below it (1).
 */
const PICKER_CHROME_ROWS = 4;

/**
 * The picker's height, sized to its content (two rows per candidate) but capped
 * to the terminal so a large `interactiveCount` still fits; past the cap the list
 * scrolls internally (see `showScrollIndicator` in {@link buildPickerScene}). An
 * explicit height keeps the picker compact - only as tall as the options need -
 * rather than stretching to fill the screen.
 */
export function pickerHeight(count: number, terminalRows: number): number {
  const wanted = Math.max(1, count) * PICKER_LINES_PER_ITEM;
  const cap = Math.max(
    PICKER_LINES_PER_ITEM,
    terminalRows - PICKER_CHROME_ROWS,
  );
  return Math.min(wanted, cap);
}

/** The `@opentui/core` module, however it is obtained (dynamic import or test). */
type TuiModule = typeof import("@opentui/core");
/** The renderer object returned by `createCliRenderer` (and the headless test renderer). */
type TuiRenderer = Awaited<ReturnType<TuiModule["createCliRenderer"]>>;

/** The renderables the caller wires key handling to after building the scene. */
export interface PickerScene {
  root: InstanceType<TuiModule["BoxRenderable"]>;
  select: InstanceType<TuiModule["SelectRenderable"]>;
}

/**
 * Build the picker's renderable tree: a header line above the candidate list.
 * Extracted from {@link selectWithTui} so the layout can be rendered under
 * OpenTUI's headless test renderer and asserted on. The caller adds `root` to
 * the renderer and wires key handling to the returned `select`.
 */
export function buildPickerScene(
  renderer: TuiRenderer,
  tui: TuiModule,
  messages: string[],
  terminalRows: number,
): PickerScene {
  const { BoxRenderable, TextRenderable, SelectRenderable } = tui;

  const root = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    gap: 1,
  });

  const header = new TextRenderable(renderer, {
    content:
      "Pick a commit message   ↑/↓ select · ⏎ commit · e edit · q cancel",
  });

  // A compact, content-sized list of the candidate messages. flexShrink:0 keeps
  // it at its full height; showScrollIndicator covers more options than fit.
  const select = new SelectRenderable(renderer, {
    height: pickerHeight(messages.length, terminalRows),
    flexShrink: 0,
    showScrollIndicator: true,
    options: messages.map((message, index) => ({
      name: firstLine(message),
      description: bodyPreview(message),
      value: index,
    })),
    selectedIndex: 0,
    showDescription: true,
    wrapSelection: true,
    // A calm slate highlight (OpenTUI's own default background) with soft
    // near-white text - the previous bright cyan/black fill was too harsh.
    // The default description greys (#888888 / #CCCCCC) read fine on the slate,
    // so they are left untouched.
    selectedBackgroundColor: "#334455",
    selectedTextColor: "#e6edf3",
  });

  root.add(header);
  root.add(select);

  return { root, select };
}

/** The OpenTUI selection screen. Resolves with the user's choice. */
async function selectWithTui(messages: string[]): Promise<Selection> {
  const tui = await import("@opentui/core");
  const renderer = await tui.createCliRenderer({ exitOnCtrlC: false });

  return await new Promise<Selection>((resolve, reject) => {
    let settled = false;
    let onKey: (key: { name?: string; ctrl?: boolean }) => void = () => {};

    const cleanup = () => {
      try {
        renderer.keyInput.off("keypress", onKey);
      } catch {
        /* ignore */
      }
      try {
        renderer.destroy();
      } catch {
        /* ignore */
      }
    };
    const finish = (sel: Selection) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(sel);
    };

    try {
      const terminalRows = process.stdout.rows ?? 24;
      const { root, select } = buildPickerScene(
        renderer,
        tui,
        messages,
        terminalRows,
      );
      renderer.root.add(root);

      onKey = (key) => {
        if (!key) return; // some terminals can emit empty/unknown key events
        try {
          switch (key.name) {
            case "up":
            case "k":
              select.moveUp();
              renderer.requestRender();
              break;
            case "down":
            case "j":
              select.moveDown();
              renderer.requestRender();
              break;
            case "return":
            case "enter":
              finish({ action: "commit", index: select.getSelectedIndex() });
              break;
            case "e":
              finish({ action: "edit", index: select.getSelectedIndex() });
              break;
            case "q":
            case "escape":
              finish({ action: "cancel" });
              break;
            case "c":
              if (key.ctrl) finish({ action: "cancel" });
              break;
          }
        } catch {
          // A renderable method threw unexpectedly. Rather than let the error
          // escape the key handler and leave the terminal stuck in raw mode,
          // cancel cleanly - finish() restores the terminal via cleanup().
          finish({ action: "cancel" });
        }
      };

      renderer.keyInput.on("keypress", onKey);
      renderer.start();
      renderer.requestRender();
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

/** Plain-prompt fallback when the TUI is unavailable. */
async function selectWithReadline(messages: string[]): Promise<Selection> {
  process.stderr.write("\nCandidate commit messages:\n");
  messages.forEach((m, i) =>
    process.stderr.write(`  ${i + 1}. ${firstLine(m)}\n`),
  );

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const answer = (
        await new Promise<string>((res) =>
          rl.question(
            `Choose 1-${messages.length}, "e N" to edit, or q to quit: `,
            res,
          ),
        )
      )
        .trim()
        .toLowerCase();

      if (answer === "q" || answer === "") return { action: "cancel" };

      const editMatch = answer.match(/^e\s*(\d+)$/);
      if (editMatch) {
        const index = parseInt(editMatch[1]!, 10) - 1;
        if (index >= 0 && index < messages.length)
          return { action: "edit", index };
      }

      const choice = parseInt(answer, 10);
      if (choice >= 1 && choice <= messages.length) {
        return { action: "commit", index: choice - 1 };
      }
      process.stderr.write("Invalid choice.\n");
    }
  } finally {
    rl.close();
  }
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? text;
}

/** A short, single-line preview of a message body (everything after the subject). */
function bodyPreview(text: string): string {
  const rest = text.split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim();
  return rest.length > 120 ? rest.slice(0, 117) + "…" : rest;
}
