type Level = "info" | "warn" | "error" | "debug";

const CLIENT_COLORS: Record<Level, string> = {
  info: "#38BDF8",
  warn: "#FACC15",
  error: "#F97316",
  debug: "#818CF8",
};

function printClient(level: Level, context: string, message: string, data?: unknown) {
  const prefix = `[${level.toUpperCase()}] [${context}]`;

  if (data !== undefined) {
    console.groupCollapsed(
      `%c${prefix}%c ${message}`,
      `color:${CLIENT_COLORS[level]};font-weight:bold`,
      "color:inherit"
    );
    console.log("time:", new Date().toISOString());
    console.log("data:", data);
    console.groupEnd();
    return;
  }

  console[level === "error" ? "error" : level === "warn" ? "warn" : "info"](
    `%c${prefix}%c ${message}  %c${new Date().toISOString()}`,
    `color:${CLIENT_COLORS[level]};font-weight:bold`,
    "color:inherit",
    "color:#666;font-size:10px"
  );
}

export const logger = {
  info: (context: string, message: string, data?: unknown) => printClient("info", context, message, data),
  warn: (context: string, message: string, data?: unknown) => printClient("warn", context, message, data),
  error: (context: string, message: string, data?: unknown) => printClient("error", context, message, data),
  debug: (context: string, message: string, data?: unknown) => printClient("debug", context, message, data),
};
