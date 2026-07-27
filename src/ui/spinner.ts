/**
 * The progress spinner for non-interactive runs, rendered by `ora`.
 *
 * It writes to stderr (so stdout stays clean for piping) and only animates when
 * explicitly enabled: callers gate on `process.stderr.isTTY` and `--no-spinner`,
 * and ora's own TTY/CI detection is bypassed so that decision lives in one
 * place. When disabled, `start`/`update` are silent no-ops but final status
 * lines (`succeed`/`fail`) still print. This keeps the progress indicator out
 * of the way of `cco --dry-run | git commit -F -`.
 *
 * The animation is chosen by the `spinner` config key: any name from the
 * cli-spinners set bundled with ora, defaulting to {@link DEFAULT_SPINNER}.
 */
import ora, { spinners, type Ora, type Spinner as SpinnerAnimation } from "ora";
import { color } from "./colors";

/** The spinner used when none (or an unknown one) is configured. */
export const DEFAULT_SPINNER = "bouncingBall";

/** Whether `name` is one of the cli-spinners animations bundled with ora. */
export function isSpinnerName(name: string): boolean {
  return Object.hasOwn(spinners, name);
}

/**
 * Look up a spinner animation by name, falling back to {@link DEFAULT_SPINNER}
 * for unknown names (ora itself throws on those, and a cosmetic option must
 * never be able to break a commit).
 */
export function resolveSpinner(name: string): SpinnerAnimation {
  const known = (spinners as Record<string, SpinnerAnimation | undefined>)[
    name
  ];
  return known ?? spinners[DEFAULT_SPINNER];
}

export class Spinner {
  private instance: Ora | null = null;
  private readonly enabled: boolean;
  private readonly animation: SpinnerAnimation;

  constructor(enabled = process.stderr.isTTY, spinnerName = DEFAULT_SPINNER) {
    this.enabled = Boolean(enabled);
    this.animation = resolveSpinner(spinnerName);
  }

  start(label: string): void {
    if (!this.enabled) return;
    this.instance?.stop();
    this.instance = ora({
      text: label,
      spinner: this.animation,
      stream: process.stderr,
      // The caller already decided (TTY check + --no-spinner); don't let ora's
      // own TTY/CI detection silently disagree.
      isEnabled: true,
    }).start();
  }

  update(label: string): void {
    if (this.instance) this.instance.text = label;
  }

  /** Stop and clear the spinner line, optionally printing a final status line. */
  stop(finalLine?: string): void {
    this.instance?.stop();
    this.instance = null;
    if (finalLine !== undefined) process.stderr.write(finalLine + "\n");
  }

  succeed(label: string): void {
    this.stop(`${color("32", "✔")} ${label}`);
  }

  fail(label: string): void {
    this.stop(`${color("31", "✖")} ${label}`);
  }
}
