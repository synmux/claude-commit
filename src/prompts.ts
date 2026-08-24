/**
 * Prompt construction for the two-stage pipeline.
 *
 * Stage 1 (summary model): read a diff chunk and describe the change factually.
 * Stage 2 (final model): turn the summaries into a commit message that obeys the
 * configured formatting rules (conventional commits, gitmoji, template, body).
 */
import type { ChangePriority, Config, DiffSummary } from "./types";

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

/**
 * What "low priority" means, phrased once for both stages so the summary
 * model and the final model share the same picture of the content.
 */
const LOW_PRIORITY_DESCRIPTION =
  "paths the user has marked as low priority - typically generated or vendored content such as " +
  "tool-generated documentation, lockfiles, snapshots or build output - whose changes matter less " +
  "than the rest of the commit";

/**
 * System prompt for the diff-summarization stage. The low-priority variant
 * asks for a deliberately short summary: the final model only needs to know
 * which areas changed and how, so the churn cannot crowd out the primary
 * changes when the summaries are combined.
 */
export function buildSummarySystem(
  priority: ChangePriority = "primary",
): string {
  const role =
    "You are an expert software engineer analyzing a git diff in preparation for writing a commit message.";
  const guidance =
    priority === "low"
      ? [
          `The diff you are given comes from ${LOW_PRIORITY_DESCRIPTION}.`,
          "Summarize it briefly: a few sentences at most, naming which files or areas changed and the nature of the change (regenerated, bumped, added, removed), without describing individual edits.",
        ]
      : [
          "Summarize the change factually and concisely: which files changed, what was added, removed or modified, and the apparent intent and impact of the change.",
          "Focus on the substance of the change, not a line-by-line readout.",
        ];
  return [
    role,
    ...guidance,
    "Do not write a commit message. Do not include code fences or the raw diff.",
    "If you are told this is one part of a larger change, summarize only the part you are given.",
  ].join(" ");
}

/** User prompt for a single diff chunk in the summarization stage. */
export function buildSummaryUser(
  chunk: string,
  index: number,
  total: number,
  priority: ChangePriority = "primary",
): string {
  const subject = priority === "low" ? "low-priority diff" : "diff";
  const preamble =
    total > 1
      ? `This is part ${index + 1} of ${total} of a larger ${subject}. Summarize only this part:`
      : `Summarize the following ${subject}:`;
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
 * The weighting rules for a change with both primary and low-priority parts.
 * They live in the system prompt next to the other subject-line rules so
 * they carry the same authority, and every clause is branched on the config
 * exactly as those rules are: a plain single-line setup is never told about
 * a type, a gitmoji or a body it was not asked for. The wording is absolute
 * and size-independent on purpose - a twenty-line fix next to thousands of
 * regenerated lines must still read as a fix, however dull the fix is.
 */
function lowPriorityWeightingRules(config: Config): string[] {
  const rules = [
    `The summary is split into primary changes and low-priority changes (${LOW_PRIORITY_DESCRIPTION}). ` +
      "The primary changes are what this commit is about.",
    "The subject line describes the primary changes. This holds however small or routine the primary changes are " +
      "and however many files or lines the low-priority changes touch: a one-line primary change still owns the subject. " +
      "If the primary changes seem too small to fill a subject line, write a short subject about them anyway rather than " +
      "reaching for the low-priority changes to pad it. " +
      "Mention the low-priority changes in the subject only if they fit naturally without displacing anything about the primary changes.",
  ];
  if (config.conventionalCommits) {
    rules.push(
      "Choose the commit type and scope from the primary changes alone.",
    );
  }
  if (config.gitmoji) {
    rules.push("Choose the gitmoji from the primary changes alone.");
  }
  return rules;
}

/**
 * System prompt for the final commit-message stage, encoding all formatting
 * rules. When `structured` is true, the model returns its messages as JSON, so
 * the "no markdown" guidance is scoped to each message's own text. When
 * `hasLowPriority` is true the summaries come in two priority groups and the
 * weighting rules ({@link lowPriorityWeightingRules}) are added between the
 * subject-line rules and the body rule, in the order the constraints apply.
 */
export function buildFinalSystem(
  config: Config,
  structured = false,
  hasLowPriority = false,
): string {
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

  if (hasLowPriority) rules.push(...lowPriorityWeightingRules(config));

  if (config.multiline) {
    rules.push(
      "After the subject line, add one blank line and then a body that explains what changed and why. " +
        'Use concise bullet points ("- ...") when there are several distinct changes. Wrap body lines at about 72 characters.' +
        (hasLowPriority
          ? " Cover the primary changes first and in full, then reference the low-priority changes briefly after them."
          : ""),
    );
  } else {
    rules.push("Output only the single subject line. Do not include a body.");
  }

  if (config.customPrompt) {
    rules.push(`Additional instructions from the user: ${config.customPrompt}`);
  }

  rules.push(
    structured
      ? "Each commit message must be the raw message text only - no surrounding quotes, no markdown, and no code fences."
      : "Output ONLY the commit message itself: no surrounding quotes, no markdown, no code fences, no preamble, and no explanation.",
  );

  return rules.join("\n");
}

/**
 * The shared instruction for requesting several distinct options.
 *
 * It insists each option be a COMPLETE message obeying the formatting rules -
 * crucially the body when `multiline` is on. The previous wording asked the
 * model to "vary the structure" of the options, which let it drop bodies to
 * manufacture variety, so `multiline` appeared to be ignored in interactive
 * mode even though the system prompt still required a body.
 */
function multiOptionInstruction(count: number, hasLowPriority = false): string {
  // With two priority groups, "different in emphasis" would license one
  // option to lead with the churn - and this is the last instruction the
  // model reads - so the variety axis is scoped to the primary changes and
  // the subject rule is re-anchored. With one group the wording is untouched.
  const variety = hasLowPriority
    ? "Make the options genuinely different in wording and in which aspect of the primary changes they emphasise, " +
      "but never drop the subject or a required body just to create variety. " +
      "Each option's subject line describes the primary changes."
    : "Make the options genuinely different in wording and emphasis, but never drop the subject or a required body just to create variety.";
  return (
    `Produce exactly ${count} distinct commit-message options for this change. ` +
    `Each option must be a complete commit message that independently obeys all the formatting rules above - ` +
    `including the blank line and body when those rules ask for one. ` +
    variety
  );
}

/** Join a group of summaries, numbering them as parts when there are several. */
function joinSummaryTexts(texts: string[]): string {
  return texts.length === 1
    ? texts[0]!
    : texts.map((text, index) => `Part ${index + 1}:\n${text}`).join("\n\n");
}

/** Whether the summaries span both priority groups (the only case that needs the weighting rules). */
export function hasLowPrioritySummaries(summaries: DiffSummary[]): boolean {
  return (
    summaries.some((summary) => summary.priority === "low") &&
    summaries.some((summary) => summary.priority === "primary")
  );
}

/**
 * Present the summaries to the final model. With a single priority group the
 * layout is the plain one; with both groups present they are labelled,
 * primary first, and closed with a one-line anchor back to the primary
 * changes. The weighting rules themselves live in the system prompt
 * ({@link buildFinalSystem}); the user turn only carries the data.
 */
function describeSummaries(summaries: DiffSummary[]): string {
  const primaryTexts = summaries
    .filter((summary) => summary.priority === "primary")
    .map((summary) => summary.text);
  const lowTexts = summaries
    .filter((summary) => summary.priority === "low")
    .map((summary) => summary.text);

  if (!hasLowPrioritySummaries(summaries)) {
    const texts = primaryTexts.length > 0 ? primaryTexts : lowTexts;
    const header =
      texts.length === 1
        ? "Here is the summary of the staged changes:"
        : "Here are summaries of the parts of the staged changes:";
    return `${header}\n\n${joinSummaryTexts(texts)}`;
  }

  return [
    "Here are summaries of the staged changes, in two groups.",
    `Primary changes (what this commit is about):\n\n${joinSummaryTexts(primaryTexts)}`,
    `Low-priority changes (${LOW_PRIORITY_DESCRIPTION}):\n\n${joinSummaryTexts(lowTexts)}`,
    "The subject line is about the primary changes above.",
  ].join("\n\n");
}

/**
 * User prompt for the final stage.
 *
 * Summaries are presented by priority group (see {@link describeSummaries}).
 * In `structured` mode the candidates are returned via {@link MESSAGES_SCHEMA}'s
 * `messages` array. Otherwise, when `count` > 1, they are separated by
 * {@link OPTION_DELIMITER} for text parsing.
 */
export function buildFinalUser(
  summaries: DiffSummary[],
  count = 1,
  structured = false,
): string {
  const described = describeSummaries(summaries);
  const hasLowPriority = hasLowPrioritySummaries(summaries);

  if (structured) {
    const ask =
      count <= 1
        ? `Produce a single commit message for this change and return it as the only element of the "messages" array.`
        : `${multiOptionInstruction(count, hasLowPriority)} Return them in the "messages" array.`;
    return `${described}\n\n${ask}`;
  }

  if (count <= 1) {
    return described;
  }

  return (
    `${described}\n\n${multiOptionInstruction(count, hasLowPriority)} ` +
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
