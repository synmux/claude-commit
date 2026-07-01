/**
 * A minimal, dependency-free progress spinner for non-interactive runs.
 *
 * It renders to stderr (so stdout stays clean for piping) and only animates when
 * stderr is a TTY; otherwise `start`/`update` are silent no-ops. This keeps the
 * read-only progress indicator out of the way of `cc --dry-run | git commit -F -`.
 */
import { color } from "./colors";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private label = "";
  private readonly enabled: boolean;

  constructor(enabled = process.stderr.isTTY) {
    this.enabled = Boolean(enabled);
  }

  start(label: string): void {
    this.label = label;
    if (!this.enabled) return;
    this.stopTimer();
    process.stderr.write("\x1b[?25l"); // hide cursor
    this.render();
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % FRAMES.length;
      this.render();
    }, INTERVAL_MS);
  }

  update(label: string): void {
    this.label = label;
    if (this.enabled && this.timer) this.render();
  }

  /** Stop and clear the spinner line, optionally printing a final status line. */
  stop(finalLine?: string): void {
    this.stopTimer();
    if (this.enabled) {
      process.stderr.write("\r\x1b[2K\x1b[?25h"); // clear line, show cursor
    }
    if (finalLine !== undefined) process.stderr.write(finalLine + "\n");
  }

  succeed(label: string): void {
    this.stop(`${color("32", "✔")} ${label}`);
  }

  fail(label: string): void {
    this.stop(`${color("31", "✖")} ${label}`);
  }

  private render(): void {
    // `\r\x1b[2K` (cursor return + clear line) only runs when enabled (a TTY);
    // the frame color additionally respects NO_COLOR via the helper.
    process.stderr.write(
      `\r\x1b[2K${color("36", FRAMES[this.frame]!)} ${this.label}`,
    );
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
