/**
 * Model-string parsing: which provider serves a configured model name.
 *
 * A model string is either a Claude model (an alias like `sonnet`, or a full
 * `claude-*` id) or, with an `ollama:` prefix, a model on a local or
 * self-hosted Ollama server. Everything after the prefix is the Ollama model
 * name **verbatim**, which matters because Ollama names carry their own
 * colon: `ollama:ornith-1.5:35b` is the model `ornith-1.5:35b`, not
 * `ornith-1.5` with some tag `35b` cco is expected to reassemble. Only the
 * first `ollama:` is consumed.
 *
 * The prefix is matched case-insensitively - it is cco's own syntax, and
 * `Ollama:` is an easy thing to type - while the model name is passed
 * through with its case intact, because Ollama's registry is case-sensitive.
 *
 * This module is deliberately free of transport and SDK imports so that
 * anything needing to know *which* provider a name refers to (chunk sizing
 * in `src/tokens.ts`, for one) can ask without pulling in a backend.
 */
import { ClaudeCommitError } from "./errors";

/** Marks a model name as belonging to an Ollama server. Case-insensitive. */
export const OLLAMA_PREFIX = "ollama:";

/** Which backend serves a model. */
export type ModelProvider = "claude" | "ollama";

/** A model string resolved into a provider and the name that provider expects. */
export interface ModelRef {
  provider: ModelProvider;
  /** The model name to send to the provider, with any cco prefix removed. */
  name: string;
}

/**
 * Default Ollama base URL, used when neither the config nor `$OLLAMA_HOST`
 * names one. This is Ollama's own default listen address.
 */
export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

/**
 * Default context window requested for Ollama models, in tokens.
 *
 * Ollama's own default is chosen from available VRAM (4k / 32k / 256k), so
 * the same config behaves differently on a laptop and a workstation, and a
 * prompt over the limit is truncated silently. cco therefore always states a
 * number. 32768 is the middle tier: comfortably more than a typical diff
 * chunk needs, and within reach of most machines that can run a useful
 * summarisation model at all. Raise it in config when the hardware allows -
 * memory use scales with it.
 */
export const DEFAULT_OLLAMA_CONTEXT_TOKENS = 32_768;

/** Whether `model` names an Ollama model (i.e. carries the `ollama:` prefix). */
export function isOllamaModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith(OLLAMA_PREFIX);
}

/**
 * Resolve a configured model string into its provider and provider-side name.
 *
 * Throws {@link ClaudeCommitError} for a name that no provider could serve:
 * an empty string, or an `ollama:` prefix with nothing after it.
 */
export function parseModelRef(model: string): ModelRef {
  const trimmed = model.trim();
  if (trimmed === "") {
    throw new ClaudeCommitError(
      "No model configured. Set a model name, or an Ollama model as " +
        `"${OLLAMA_PREFIX}<name>:<tag>".`,
    );
  }
  if (!isOllamaModel(trimmed)) {
    return { provider: "claude", name: trimmed };
  }
  const name = trimmed.slice(OLLAMA_PREFIX.length).trim();
  if (name === "") {
    throw new ClaudeCommitError(
      `"${model}" names no Ollama model. Write the model after the prefix, ` +
        `e.g. "${OLLAMA_PREFIX}ornith-1.5:35b".`,
    );
  }
  return { provider: "ollama", name };
}

/** A model string as it should appear in an error or a `--verbose` line. */
export function describeModel(model: string): string {
  const trimmed = model.trim();
  return isOllamaModel(trimmed) ? `${trimmed} (Ollama)` : `${trimmed} (Claude)`;
}
