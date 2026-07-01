/**
 * Prompt construction for the two-stage pipeline.
 *
 * Stage 1 (summary model): read a diff chunk and describe the change factually.
 * Stage 2 (final model): turn the summaries into a commit message that obeys the
 * configured formatting rules (conventional commits, gitmoji, template, body).
 */
import type { Config } from "./types";

/** Sentinel separating candidate messages in interactive mode. */
export const OPTION_DELIMITER = "===OPTION===";

/** A compact gitmoji cheat-sheet to steer the model toward sensible choices. */
const GITMOJI_GUIDE = [
  "✨ new feature",
  "🐛 bug fix",
  "📝 documentation",
  "♻️ refactor",
  "⚡️ performance",
  "✅ tests",
  "🔧 configuration / tooling",
  "🎨 structure / formatting",
  "🚚 move / rename",
  "🔥 remove code or files",
  "⬆️ upgrade dependencies",
  "👷 CI build system",
  "🚑️ critical hotfix",
  "🔒️ security",
].join(", ");

const CONVENTIONAL_TYPES =
  "feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert";

/** System prompt for the diff-summarization stage. */
export function buildSummarySystem(): string {
  return [
    "You are an expert software engineer analyzing a git diff in preparation for writing a commit message.",
    "Summarize the change factually and concisely: which files changed, what was added, removed or modified, and the apparent intent and impact of the change.",
    "Focus on the substance of the change, not a line-by-line readout.",
    "Do not write a commit message. Do not include code fences or the raw diff.",
    "If you are told this is one part of a larger change, summarize only the part you are given.",
  ].join(" ");
}

/** User prompt for a single diff chunk in the summarization stage. */
export function buildSummaryUser(
  chunk: string,
  index: number,
  total: number,
): string {
  const preamble =
    total > 1
      ? `This is part ${index + 1} of ${total} of a larger diff. Summarize only this part:`
      : "Summarize the following diff:";
  return `${preamble}\n\n${chunk}`;
}

/**
 * JSON schema for the final stage's structured output: a list of candidate
 * commit messages. Requesting this makes parsing robust regardless of how the
 * model chooses to format its prose.
 */
export const MESSAGES_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      description:
        "The commit message(s), each a complete raw commit message string.",
      items: { type: "string" },
    },
  },
  required: ["messages"],
  additionalProperties: false,
};

/** Pull the message list out of a structured-output object, or return null if malformed. */
export function extractMessages(structured: unknown): string[] | null {
  if (
    structured &&
    typeof structured === "object" &&
    Array.isArray((structured as { messages?: unknown }).messages)
  ) {
    const messages = (structured as { messages: unknown[] }).messages.filter(
      (m): m is string => typeof m === "string",
    );
    if (messages.length > 0) return messages;
  }
  return null;
}

/**
 * System prompt for the final commit-message stage, encoding all formatting
 * rules. When `structured` is true, the model returns its messages as JSON, so
 * the "no markdown" guidance is scoped to each message's own text.
 */
export function buildFinalSystem(config: Config, structured = false): string {
  const rules: string[] = [
    "You are an expert at writing clear, high-quality git commit messages.",
    "You are given a summary of staged changes and must produce a commit message for them.",
  ];

  // Subject-line style.
  if (config.conventionalCommits) {
    rules.push(
      `Format the subject line as a Conventional Commit: "type(scope): description". ` +
        `Choose the most appropriate type from: ${CONVENTIONAL_TYPES}. ` +
        `The scope is optional and should be a short noun for the affected area. ` +
        `The description is in the imperative mood, lower case, with no trailing period.`,
    );
  } else {
    rules.push(
      'Write the subject line in the imperative mood (e.g. "Add", not "Added" or "Adds"), ' +
        "capitalized, concise (aim for 50 characters, 72 at most), with no trailing period.",
    );
  }

  if (config.gitmoji) {
    rules.push(
      `Begin the subject line with a single appropriate gitmoji, followed by a space. ` +
        `Pick from: ${GITMOJI_GUIDE}.` +
        (config.conventionalCommits
          ? ' Place the gitmoji before the conventional-commit type, e.g. "✨ feat: ...".'
          : ""),
    );
  }

  if (config.template) {
    rules.push(
      `The subject line MUST follow this exact template, substituting {message} with the commit description ` +
        `(after applying the rules above to that description): "${config.template}".`,
    );
  }

  if (config.multiline) {
    rules.push(
      "After the subject line, add one blank line and then a body that explains what changed and why. " +
        'Use concise bullet points ("- ...") when there are several distinct changes. Wrap body lines at about 72 characters.',
    );
  } else {
    rules.push("Output only the single subject line. Do not include a body.");
  }

  if (config.customPrompt) {
    rules.push(`Additional instructions from the user: ${config.customPrompt}`);
  }

  rules.push(
    structured
      ? "Each commit message must be the raw message text only — no surrounding quotes, no markdown, and no code fences."
      : "Output ONLY the commit message itself: no surrounding quotes, no markdown, no code fences, no preamble, and no explanation.",
  );

  return rules.join("\n");
}

/**
 * User prompt for the final stage.
 *
 * In `structured` mode the candidates are returned via {@link MESSAGES_SCHEMA}'s
 * `messages` array. Otherwise, when `count` > 1, they are separated by
 * {@link OPTION_DELIMITER} for text parsing.
 */
export function buildFinalUser(
  summaries: string[],
  count = 1,
  structured = false,
): string {
  const joined =
    summaries.length === 1
      ? summaries[0]!
      : summaries.map((s, i) => `Part ${i + 1}:\n${s}`).join("\n\n");

  const header =
    summaries.length === 1
      ? "Here is the summary of the staged changes:"
      : "Here are summaries of the parts of the staged changes:";

  if (structured) {
    const ask =
      count <= 1
        ? `Produce a single commit message for this change and return it as the only element of the "messages" array.`
        : `Produce exactly ${count} distinct commit-message options for this change. ` +
          `Vary the wording, structure and emphasis so the options are genuinely different. ` +
          `Return them in the "messages" array.`;
    return `${header}\n\n${joined}\n\n${ask}`;
  }

  if (count <= 1) {
    return `${header}\n\n${joined}`;
  }

  return (
    `${header}\n\n${joined}\n\n` +
    `Produce exactly ${count} distinct commit-message options for this change. ` +
    `Vary the wording, structure and emphasis so the options are genuinely different. ` +
    `Output each option on its own, preceded by a line containing exactly "${OPTION_DELIMITER}" and nothing else. ` +
    `Do not number the options or add any other text.`
  );
}

/** Parse the multi-option response from the final stage into individual messages. */
export function parseOptions(text: string): string[] {
  return text
    .split(OPTION_DELIMITER)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Strip stray formatting a model may add despite instructions (fences, wrapping quotes). */
export function cleanMessage(text: string): string {
  let msg = text.trim();

  // Remove a single wrapping fenced code block.
  const fence = msg.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fence) msg = fence[1]!.trim();

  // Remove matching wrapping quotes only if the whole message is quoted.
  if (msg.length >= 2) {
    const first = msg[0];
    const last = msg[msg.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = msg.slice(1, -1);
      if (!inner.includes(first)) msg = inner.trim();
    }
  }

  return msg;
}
