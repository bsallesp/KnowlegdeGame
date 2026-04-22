import { randomBytes } from "crypto";

type Level = "info" | "warn" | "error" | "debug";

const COLORS: Record<Level, string> = {
  info:  "\x1b[36m",   // cyan
  warn:  "\x1b[33m",   // yellow
  error: "\x1b[31m",   // red
  debug: "\x1b[35m",   // magenta
};
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Structured log entry ─────────────────────────────────────────────────────

interface LogEntry {
  ts:        string;
  level:     Level;
  context:   string;
  message:   string;
  requestId?: string;
  data?:     unknown;
}

function serializeLogData(data: unknown): unknown {
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: process.env.NODE_ENV === "development" ? data.stack : undefined,
    };
  }

  return data;
}

// ─── File output ──────────────────────────────────────────────────────────────

function writeToFile(entry: LogEntry) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs   = require("fs")   as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const logDir  = path.resolve(process.cwd(), "logs");
    const logFile = path.join(logDir, "app.log");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES) {
      fs.renameSync(logFile, logFile.replace(".log", `.${Date.now()}.log`));
    }
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // File logging must never crash the app
  }
}

// ─── Server console output ────────────────────────────────────────────────────

function printServer(entry: LogEntry) {
  const color  = COLORS[entry.level];
  const label  = entry.level.toUpperCase().padEnd(5);
  const rid    = entry.requestId ? `${DIM}[${entry.requestId}]${RESET} ` : "";
  const prefix = `${color}${BOLD}${label}${RESET} ${DIM}${entry.ts}${RESET} ${BOLD}[${entry.context}]${RESET} ${rid}`;

  if (entry.data !== undefined) {
    console[entry.level === "debug" ? "log" : entry.level](prefix + entry.message);
    console[entry.level === "debug" ? "log" : entry.level](
      `${DIM}      ↳${RESET}`,
      JSON.stringify(entry.data, null, 2).split("\n").join("\n        ")
    );
  } else {
    console[entry.level === "debug" ? "log" : entry.level](prefix + entry.message);
  }
}

// ─── Client console output ────────────────────────────────────────────────────

const CLIENT_COLORS: Record<Level, string> = {
  info: "#38BDF8", warn: "#FACC15", error: "#F97316", debug: "#818CF8",
};

function printClient(entry: LogEntry) {
  const prefix = `[${entry.level.toUpperCase()}] [${entry.context}]`;
  const rid    = entry.requestId ? ` (${entry.requestId})` : "";

  if (entry.data !== undefined) {
    console.groupCollapsed(
      `%c${prefix}%c ${entry.message}${rid}`,
      `color:${CLIENT_COLORS[entry.level]};font-weight:bold`,
      "color:inherit"
    );
    console.log("time:", entry.ts);
    console.log("data:", entry.data);
    console.groupEnd();
  } else {
    console[entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "info"](
      `%c${prefix}%c ${entry.message}${rid}  %c${entry.ts}`,
      `color:${CLIENT_COLORS[entry.level]};font-weight:bold`,
      "color:inherit",
      "color:#666;font-size:10px"
    );
  }
}

// ─── Core log function ────────────────────────────────────────────────────────

function log(level: Level, context: string, message: string, data?: unknown, requestId?: string) {
  if (level === "debug" && process.env.NODE_ENV !== "development") return;
  const serializedData = data !== undefined ? serializeLogData(data) : undefined;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    context,
    message,
    ...(requestId ? { requestId } : {}),
    ...(serializedData !== undefined ? { data: serializedData } : {}),
  };

  if (typeof window === "undefined") {
    writeToFile(entry);
    printServer(entry);
  } else {
    printClient(entry);
  }
}

// ─── Request ID helper ────────────────────────────────────────────────────────

export function generateRequestId(): string {
  return randomBytes(4).toString("hex"); // e.g. "a3f2b1c0"
}

/**
 * Creates a child logger bound to a specific request ID.
 * Use this at the top of each API route handler for correlated logs.
 *
 * @example
 * const log = requestLogger("auth/login", req);
 * log.info("Login attempt", { email });
 */
export function requestLogger(context: string, requestId?: string) {
  const rid = requestId ?? generateRequestId();
  return {
    requestId: rid,
    info:  (message: string, data?: unknown) => log("info",  context, message, data, rid),
    warn:  (message: string, data?: unknown) => log("warn",  context, message, data, rid),
    error: (message: string, data?: unknown) => log("error", context, message, data, rid),
    debug: (message: string, data?: unknown) => log("debug", context, message, data, rid),
  };
}

// ─── Global logger (no request ID) ───────────────────────────────────────────

export const logger = {
  info:  (context: string, message: string, data?: unknown) => log("info",  context, message, data),
  warn:  (context: string, message: string, data?: unknown) => log("warn",  context, message, data),
  error: (context: string, message: string, data?: unknown) => log("error", context, message, data),
  debug: (context: string, message: string, data?: unknown) => log("debug", context, message, data),
};
