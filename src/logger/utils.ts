export const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
} as const;

/**
 * Get the minimum log level from environment variable.
 * Defaults to "info" if not set or invalid.
 */
export function getMinLogLevel() {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return LOG_LEVELS[envLevel as LogLevel];
  }
  return LOG_LEVELS.info;
}

/**
 * Format timestamp as [YYYY-MM-DD HH:mm:ss.SSS]
 */
export function formatTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");

  return `${colors.dim}[${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}]${colors.reset}`;
}

const levelConfig: Record<LogLevel, { color: string; label: string }> = {
  debug: { color: colors.cyan, label: "DEBUG" },
  info: { color: colors.green, label: "INFO " },
  warn: { color: colors.yellow, label: "WARN " },
  error: { color: `${colors.bold}${colors.red}`, label: "ERROR" },
};

/**
 * Format log level as colored [LEVEL]
 */
export function formatLevel(level: LogLevel) {
  const config = levelConfig[level];
  return `${config.color}[${config.label}]${colors.reset}`;
}

/**
 * Format service name as colored [service] or [service:id]
 */
export function formatService(service?: string, id?: string) {
  if (!service) return "";

  let label = service;
  if (id) {
    // Truncate ID to first 8 chars for readability
    const shortId = id.length > 8 ? id.slice(0, 8) : id;
    label = `${service}:${shortId}`;
  }

  return `${colors.blue}[${label}]${colors.reset}`;
}

/**
 * Format arguments for inline display.
 * Converts objects/errors to string representation.
 */
export function formatArgs(args: unknown[]) {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`;
      }
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}
