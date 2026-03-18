import fs from "fs";
import path from "path";

type Level = "info" | "warn" | "error" | "debug";

const COLORS: Record<Level, string> = {
  info:  "\x1b[36m",  // cyan
  warn:  "\x1b[33m",  // yellow
  error: "\x1b[31m",  // red
  debug: "\x1b[35m",  // magenta
};
const RESET = "\x1b[0m";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB

function writeToFile(level: Level, context: string, message: string, ts: string, data?: unknown) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    // Rotate if over limit
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE.replace(".log", `.${Date.now()}.log`));
    }
    const entry = JSON.stringify({ ts, level, context, message, ...(data !== undefined ? { data } : {}) });
    fs.appendFileSync(LOG_FILE, entry + "\n", "utf8");
  } catch {
    // File logging must never crash the app
  }
}

function log(level: Level, context: string, message: string, data?: unknown) {
  if (level === "debug" && process.env.NODE_ENV !== "development") return;

  const ts = new Date().toISOString();
  const isServer = typeof window === "undefined";

  if (isServer) {
    writeToFile(level, context, message, ts, data);
    const color = COLORS[level];
    const prefix = `${color}[${ts}] [${level.toUpperCase()}] [${context}]${RESET}`;
    if (data !== undefined) {
      console[level === "debug" ? "log" : level](prefix, message, data);
    } else {
      console[level === "debug" ? "log" : level](prefix, message);
    }
  } else {
    // Client-side: grouped, collapsible
    const prefix = `[${level.toUpperCase()}] [${context}]`;
    if (data !== undefined) {
      console.groupCollapsed(`%c${prefix}%c ${message}`, `color:${clientColor(level)};font-weight:bold`, "color:inherit");
      console.log("time:", ts);
      console.log("data:", data);
      console.groupEnd();
    } else {
      console[level === "debug" ? "log" : level === "error" ? "error" : level === "warn" ? "warn" : "info"](
        `%c${prefix}%c ${message}  %c${ts}`,
        `color:${clientColor(level)};font-weight:bold`,
        "color:inherit",
        "color:#666;font-size:10px"
      );
    }
  }
}

function clientColor(level: Level): string {
  return { info: "#38BDF8", warn: "#FACC15", error: "#F97316", debug: "#818CF8" }[level];
}

export const logger = {
  info:  (context: string, message: string, data?: unknown) => log("info",  context, message, data),
  warn:  (context: string, message: string, data?: unknown) => log("warn",  context, message, data),
  error: (context: string, message: string, data?: unknown) => log("error", context, message, data),
  debug: (context: string, message: string, data?: unknown) => log("debug", context, message, data),
};
