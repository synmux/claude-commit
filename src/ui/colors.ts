/**
 * Minimal ANSI color helpers for stderr output.
 *
 * Color is emitted only when stderr is a TTY and `NO_COLOR` is unset, so escape
 * codes never leak into redirected logs or CI output.
 */
export const useColor = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;

/** Wrap `text` in an ANSI SGR sequence when color is enabled, else return it unchanged. */
export function color(code: string, text: string): string {
  return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}
