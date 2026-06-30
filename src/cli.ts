/**
 * Command-line interface: argument parsing (Commander) and orchestration of the
 * non-interactive and interactive flows.
 */
import { Command } from "commander";
import {
  commit,
  getStagedDiff,
  getStagedStat,
  isGitRepo,
  getRepoRoot,
  stageAll,
} from "./git";
import { loadFileConfig, resolveConfig } from "./config";
import { generateCommit } from "./generate";
import { Spinner } from "./ui/spinner";
import { confirmCommit, editInEditor } from "./ui/editor";
import { ClaudeCommitError } from "./errors";
import type { ModelConfig, PartialConfig } from "./types";

export const VERSION = "0.1.0";

interface CliOptions {
  interactive?: boolean;
  count?: number;
  multiline?: boolean;
  conventional?: boolean;
  gitmoji?: boolean;
  template?: string;
  prompt?: string;
  all?: boolean;
  modelSummary?: string;
  modelFinal?: string;
  dryRun?: boolean;
  yes?: boolean;
  spinner?: boolean;
  config?: string;
  verbose?: boolean;
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name("cc")
    .description("Generate a git commit message with Claude.")
    .version(VERSION, "-V, --version", "output the version number")
    .option(
      "-i, --interactive",
      "choose between several options in an interactive TUI",
    )
    .option(
      "-n, --count <n>",
      "number of options to generate in interactive mode",
      (v) => parseInt(v, 10),
    )
    .option("-a, --all", "stage all changes (git add -A) before committing")
    .option("-c, --conventional", "format as a Conventional Commit")
    .option("-g, --gitmoji", "prefix the subject with a gitmoji")
    .option("-m, --multiline", "write a multi-line commit (subject + body)")
    .option("--no-multiline", "write only a single-line subject")
    .option(
      "-t, --template <tpl>",
      'template for the first line, e.g. "[PROJ-1] {message}"',
    )
    .option("-p, --prompt <text>", "extra instructions appended to the prompt")
    .option("--model-summary <model>", "model used to summarize the diff")
    .option("--model-final <model>", "model used to write the final message")
    .option("-d, --dry-run", "print the message to stdout without committing")
    .option("-y, --yes", "commit without asking for confirmation")
    .option("--no-spinner", "disable the progress spinner")
    .option("--config <path>", "path to a config file")
    .option("-v, --verbose", "print summaries, cost and debug output")
    .addHelpText(
      "after",
      [
        "",
        "Authentication:",
        "  Uses the Claude Agent SDK. With no ANTHROPIC_API_KEY set, it uses your",
        "  Claude Code subscription (run `claude login`), so usage is bundled with it.",
        "",
        "Examples:",
        "  cc                     generate and commit a message for staged changes",
        "  cc -a -c               stage everything and write a Conventional Commit",
        "  cc -i                  pick from several options interactively",
        "  cc --dry-run | cat     print a message without committing",
      ].join("\n"),
    );
  return program;
}

/** Map parsed CLI flags onto a partial config (only set keys the user provided). */
function flagsToConfig(opts: CliOptions): PartialConfig {
  const cfg: PartialConfig = {};
  if (opts.conventional !== undefined)
    cfg.conventionalCommits = opts.conventional;
  if (opts.gitmoji !== undefined) cfg.gitmoji = opts.gitmoji;
  if (opts.multiline !== undefined) cfg.multiline = opts.multiline;
  if (opts.template !== undefined) cfg.template = opts.template;
  if (opts.prompt !== undefined) cfg.customPrompt = opts.prompt;
  if (opts.count !== undefined && Number.isFinite(opts.count)) {
    cfg.interactiveCount = Math.max(1, opts.count);
  }
  const models: Partial<ModelConfig> = {};
  if (opts.modelSummary) models.summary = opts.modelSummary;
  if (opts.modelFinal) models.final = opts.modelFinal;
  if (Object.keys(models).length) cfg.models = models;
  return cfg;
}

function printMessage(message: string): void {
  const bar = "\x1b[90m" + "─".repeat(48) + "\x1b[0m";
  process.stderr.write(`\n${bar}\n${message}\n${bar}\n`);
}

/** Entry point. Returns a process exit code. */
export async function run(argv: string[]): Promise<number> {
  const program = buildProgram();
  program.parse(argv, { from: "user" });
  const opts = program.opts<CliOptions>();
  const verbose = Boolean(opts.verbose);

  const abortController = new AbortController();
  const onSigint = () => abortController.abort();
  process.on("SIGINT", onSigint);

  try {
    if (!(await isGitRepo())) {
      throw new ClaudeCommitError(
        "Not a git repository (or any parent). Run `cc` inside a repo.",
      );
    }
    const repoRoot = await getRepoRoot();
    const fileConfig = await loadFileConfig(
      process.cwd(),
      repoRoot,
      opts.config,
    );
    const config = resolveConfig(fileConfig, flagsToConfig(opts));

    if (opts.all) await stageAll();

    const diff = await getStagedDiff();
    if (diff.trim() === "") {
      throw new ClaudeCommitError(
        "No staged changes. Stage files with `git add`, or pass -a/--all to stage everything.",
      );
    }

    if (opts.interactive) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new ClaudeCommitError(
          "Interactive mode (-i) requires an interactive terminal.",
        );
      }
      const { runInteractive } = await import("./ui/interactive");
      return await runInteractive(diff, config, { verbose, abortController });
    }

    return await runNonInteractive(
      diff,
      config,
      opts,
      verbose,
      abortController,
    );
  } catch (err) {
    if (err instanceof ClaudeCommitError) {
      process.stderr.write(`\x1b[31merror:\x1b[0m ${err.message}\n`);
      return 1;
    }
    throw err;
  } finally {
    process.off("SIGINT", onSigint);
  }
}

async function runNonInteractive(
  diff: string,
  config: ReturnType<typeof resolveConfig>,
  opts: CliOptions,
  verbose: boolean,
  abortController: AbortController,
): Promise<number> {
  const useSpinner = opts.spinner !== false && process.stderr.isTTY;
  const spinner = new Spinner(useSpinner);

  spinner.start("Reading diff");
  let result;
  try {
    result = await generateCommit(diff, config, {
      progress: { onPhase: (label) => spinner.update(label) },
      abortController,
    });
  } catch (err) {
    spinner.stop(); // always restore the cursor / clear the line on failure
    throw err;
  }
  spinner.stop();

  if (verbose) {
    process.stderr.write(
      `\x1b[90m${result.chunkCount} chunk(s), cost $${result.costUsd.toFixed(4)}\x1b[0m\n`,
    );
    for (const [i, summary] of result.summaries.entries()) {
      process.stderr.write(
        `\x1b[90m--- summary ${i + 1} ---\n${summary}\x1b[0m\n`,
      );
    }
  }

  let message = result.messages[0]!;

  // Dry run: emit to stdout so it can be piped, and never commit.
  if (opts.dryRun) {
    process.stdout.write(message + "\n");
    return 0;
  }

  const canPrompt = process.stdin.isTTY && process.stdout.isTTY;
  if (!opts.yes && canPrompt) {
    printMessage(message);
    const choice = await confirmCommit();
    if (choice === "no") {
      process.stderr.write("Aborted. Nothing was committed.\n");
      return 1;
    }
    if (choice === "edit") {
      message = await editInEditor(message);
      if (message.trim() === "") {
        process.stderr.write("Aborted: empty commit message.\n");
        return 1;
      }
    }
  }

  const stat = verbose ? await getStagedStat().catch(() => "") : "";
  await commit(message);
  spinner.succeed("Committed");
  process.stderr.write(`\x1b[90m${firstLine(message)}\x1b[0m\n`);
  if (stat) process.stderr.write(`\x1b[90m${stat}\x1b[0m\n`);
  return 0;
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? text;
}
