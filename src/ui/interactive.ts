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
import { commit, getStagedStat } from "../git";
import { generateCommit } from "../generate";
import { Spinner } from "./spinner";
import { editInEditor } from "./editor";
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

  const stat = await getStagedStat().catch(() => "");
  const messages = result.messages;

  let selection: Selection;
  try {
    selection = await selectWithTui(messages, stat);
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
    `\x1b[32m✔\x1b[0m Committed\n\x1b[90m${firstLine(message)}\x1b[0m\n`,
  );
  if (opts.verbose) {
    process.stderr.write(`\x1b[90mcost $${result.costUsd.toFixed(4)}\x1b[0m\n`);
  }
  return 0;
}

/** The OpenTUI selection screen. Resolves with the user's choice. */
async function selectWithTui(
  messages: string[],
  stat: string,
): Promise<Selection> {
  const { createCliRenderer, BoxRenderable, TextRenderable, SelectRenderable } =
    await import("@opentui/core");

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
          "Pick a commit message    ↑/↓ move · ⏎ commit · e edit · q cancel",
      });

      const statBox = new BoxRenderable(renderer, {
        border: true,
        borderColor: "gray",
        title: "Staged changes",
        padding: 0,
      });
      statBox.add(
        new TextRenderable(renderer, {
          content: stat.trim() || "(no diff stat available)",
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
      root.add(statBox);
      root.add(select);
      renderer.root.add(root);

      onKey = (key) => {
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
