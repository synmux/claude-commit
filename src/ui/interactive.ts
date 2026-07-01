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
  | { action: "commit" | "edit"; index: number }
  | { action: "cancel" };

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
    selection = await selectWithTui(messages, diff);
  } catch {
    // TUI failed to initialize (unusual terminal, etc.) — degrade gracefully.
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

/** Max characters of diff to render in the TUI (display only; the full diff is still summarized). */
const MAX_DIFF_DISPLAY_CHARS = 100_000;
/** Rows scrolled per PageUp/PageDown press. */
const SCROLL_STEP = 10;

/** The OpenTUI selection screen. Resolves with the user's choice. */
async function selectWithTui(
  messages: string[],
  diff: string,
): Promise<Selection> {
  const {
    createCliRenderer,
    BoxRenderable,
    TextRenderable,
    SelectRenderable,
    ScrollBoxRenderable,
  } = await import("@opentui/core");

  const renderer = await createCliRenderer({ exitOnCtrlC: false });

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
      const root = new BoxRenderable(renderer, {
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 1,
        gap: 1,
      });

      const header = new TextRenderable(renderer, {
        content:
          "Pick a commit message   ↑/↓ select · PgUp/PgDn scroll diff · ⏎ commit · e edit · q cancel",
      });

      const shownDiff =
        diff.length > MAX_DIFF_DISPLAY_CHARS
          ? diff.slice(0, MAX_DIFF_DISPLAY_CHARS) +
            "\n… (diff truncated for display)"
          : diff;
      const diffBox = new ScrollBoxRenderable(renderer, {
        flexGrow: 2,
        border: true,
        borderColor: "gray",
        title: "Staged diff",
        scrollY: true,
        padding: 0,
      });
      diffBox.add(
        new TextRenderable(renderer, {
          content: shownDiff.trimEnd() || "(no diff)",
        }),
      );

      const select = new SelectRenderable(renderer, {
        flexGrow: 1,
        options: messages.map((message, index) => ({
          name: firstLine(message),
          description: bodyPreview(message),
          value: index,
        })),
        selectedIndex: 0,
        showDescription: true,
        wrapSelection: true,
        selectedBackgroundColor: "cyan",
        selectedTextColor: "black",
      });

      root.add(header);
      root.add(diffBox);
      root.add(select);
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
            case "pageup":
              diffBox.scrollBy(-SCROLL_STEP);
              renderer.requestRender();
              break;
            case "pagedown":
            case "space":
              diffBox.scrollBy(SCROLL_STEP);
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
          // cancel cleanly — finish() restores the terminal via cleanup().
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
