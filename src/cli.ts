/**
 * Command-line interface: argument parsing (Commander) and orchestration of the
 * non-interactive and interactive flows.
 */
import { Command } from "commander";
import { getVersion } from "./utils";
import {
  commit,
  getStagedDiff,
  getStagedStat,
  isGitRepo,
  getRepoRoot,
  stageAll,
} from "./git";
import { presentCredentialVars } from "./agent";
import { loadFileConfig, resolveConfig } from "./config";
import { generateCommit } from "./generate";
import { Spinner } from "./ui/spinner";
import { confirmCommit, editInEditor } from "./ui/editor";
import { color } from "./ui/colors";
import { ClaudeCommitError } from "./errors";
import type { ModelConfig, PartialConfig } from "./types";

export const VERSION = getVersion();

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
  skipArmored?: boolean;
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name("cco")
    .description("Generate a git commit message with Claude.")
    .version(VERSION, "-V, --version", "output the version number")
    .option(
      "-i, --interactive",
      "choose between several options in an interactive TUI",
    )
    .option(
      "--no-interactive",
      'skip the interactive TUI even when "interactive" is set in config',
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
    .option(
      "--skip-armored",
      "omit armored/encoded lines (age/gpg armor, base64 blobs) from the " +
        "summarized diff; recommended for chezmoi-style encrypted repos",
    )
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
        "  Uses the Claude Agent SDK with your Claude Code subscription (run",
        "  `claude login`). ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are ignored",
        '  unless the config sets "allowApiKey": true (pay-as-you-go billing).',
        "",
        "Examples:",
        "  cco                     generate and commit a message for staged changes",
        "  cco -a -c               stage everything and write a Conventional Commit",
        "  cco -i                  pick from several options interactively",
        "  cco --dry-run | cat     print a message without committing",
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
  if (opts.interactive !== undefined) cfg.interactive = opts.interactive;
  if (opts.template !== undefined) cfg.template = opts.template;
  if (opts.prompt !== undefined) cfg.customPrompt = opts.prompt;
  if (opts.skipArmored !== undefined) cfg.skipArmored = opts.skipArmored;
  if (opts.count !== undefined && Number.isFinite(opts.count)) {
    cfg.interactiveCount = Math.max(1, opts.count);
  }
  const models: Partial<ModelConfig> = {};
  if (opts.modelSummary) models.summary = opts.modelSummary;
  if (opts.modelFinal) models.final = opts.modelFinal;
  if (Object.keys(models).length) cfg.models = models;
  return cfg;
}

/**
 * Decide which flow to run from the resolved config, the raw `--interactive`
 * flag state, and whether we have an interactive terminal.
 *
 * - `--dry-run` always wins: it prints and never commits, so the TUI is skipped.
 * - Interactive requires a TTY. An explicit `-i` without one is a hard error
 *   (the user asked for something we cannot provide), whereas interactive coming
 *   only from config silently falls back to the non-interactive flow so pipes
 *   and CI keep working.
 */
export function resolveInteractiveMode(args: {
  configInteractive: boolean;
  interactiveFlag: boolean | undefined;
  dryRun: boolean;
  hasTty: boolean;
}): "interactive" | "non-interactive" | "no-tty-error" {
  if (args.dryRun) return "non-interactive";
  if (!args.configInteractive) return "non-interactive";
  if (args.hasTty) return "interactive";
  return args.interactiveFlag === true ? "no-tty-error" : "non-interactive";
}

function printMessage(message: string): void {
  const bar = color("90", "─".repeat(48));
  process.stderr.write(`\n${bar}\n${message}\n${bar}\n`);
}

/** Entry point. Returns a process exit code. */
export async function run(argv: string[]): Promise<number> {
  const program = buildProgram();
  program.parse(argv, { from: "user" });
  const opts = program.opts<CliOptions>();
  const verbose = Boolean(opts.verbose);

  const abortController = new AbortController();
  // Two-stage Ctrl-C: the first interrupt asks the in-flight generation to
  // cancel gracefully (aborting the SDK subprocess); a second, impatient
  // interrupt force-quits in case that abort is slow to take effect.
  let interrupting = false;
  const onSigint = () => {
    if (interrupting) {
      // Second Ctrl-C: force-quit. Restore the cursor in case a spinner hid it,
      // since this path bypasses the spinner's own cleanup.
      if (process.stderr.isTTY) process.stderr.write("\x1b[?25h");
      process.exit(130);
    }
    interrupting = true;
    abortController.abort();
  };
  process.on("SIGINT", onSigint);

  try {
    if (!(await isGitRepo())) {
      throw new ClaudeCommitError(
        "Not a git repository (or any parent). Run `cco` inside a repo.",
      );
    }
    const repoRoot = await getRepoRoot();
    const fileConfig = await loadFileConfig(
      process.cwd(),
      repoRoot,
      opts.config,
    );
    const config = resolveConfig(fileConfig, flagsToConfig(opts));

    // Surface the credential gate: the actual stripping happens in the agent
    // layer, but silently ignoring an exported key would be confusing.
    if (!config.allowApiKey) {
      const ignored = presentCredentialVars(process.env);
      if (ignored.length > 0) {
        process.stderr.write(
          color(
            "90",
            `Ignoring ${ignored.join(" and ")}: using subscription auth. Set ` +
              `"allowApiKey": true in your claude-commit config to use API credentials.`,
          ) + "\n",
        );
      }
    }

    if (opts.all) await stageAll();

    const diff = await getStagedDiff();
    if (diff.trim() === "") {
      throw new ClaudeCommitError(
        opts.all
          ? "No changes to commit: the working tree is clean."
          : "No staged changes. Stage files with `git add`, or pass -a/--all to stage everything.",
      );
    }

    const interactiveMode = resolveInteractiveMode({
      configInteractive: config.interactive,
      interactiveFlag: opts.interactive,
      dryRun: Boolean(opts.dryRun),
      hasTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    });
    if (interactiveMode === "no-tty-error") {
      throw new ClaudeCommitError(
        "Interactive mode (-i) requires an interactive terminal.",
      );
    }
    if (interactiveMode === "interactive") {
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
      process.stderr.write(`${color("31", "error:")} ${err.message}\n`);
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
      color(
        "90",
        `${result.chunkCount} chunk(s), cost $${result.costUsd.toFixed(4)}`,
      ) + "\n",
    );
    for (const [i, summary] of result.summaries.entries()) {
      process.stderr.write(
        color("90", `--- summary ${i + 1} ---\n${summary}`) + "\n",
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
  process.stderr.write(color("90", firstLine(message)) + "\n");
  if (stat) process.stderr.write(color("90", stat) + "\n");
  return 0;
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? text;
}
