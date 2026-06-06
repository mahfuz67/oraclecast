type Level = "info" | "warn" | "error" | "debug";

const COLORS: Record<Level, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[90m",
};
const RESET = "\x1b[0m";

export class Logger {
  constructor(private readonly scope: string) {}

  private emit(level: Level, msg: string, extra?: unknown): void {
    const ts = new Date().toISOString();
    const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
    const line = `${ts} ${tag} [${this.scope}] ${msg}`;
    if (extra !== undefined) {
      console.log(line, typeof extra === "string" ? extra : JSON.stringify(extra));
    } else {
      console.log(line);
    }
  }

  info(msg: string, extra?: unknown): void {
    this.emit("info", msg, extra);
  }
  warn(msg: string, extra?: unknown): void {
    this.emit("warn", msg, extra);
  }
  error(msg: string, extra?: unknown): void {
    this.emit("error", msg, extra);
  }
  debug(msg: string, extra?: unknown): void {
    if (process.env.DEBUG) this.emit("debug", msg, extra);
  }
}
