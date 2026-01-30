import {
  formatArgs,
  formatLevel,
  formatService,
  formatTimestamp,
  getMinLogLevel,
  LOG_LEVELS,
  LogLevel,
} from "./utils";

/**
 * Logger class with optional service context.
 */
export class Logger {
  private service?: string;
  private id?: string;

  constructor(service?: string, id?: string) {
    this.service = service;
    this.id = id;
  }

  /**
   * Create a new logger scoped to a specific service.
   * @param name Service name (e.g., worker name, DO class name)
   * @param id Optional identifier (e.g., DO object ID)
   */
  forService(name: string, id?: string): Logger {
    return new Logger(name, id);
  }

  /**
   * Core logging method.
   */
  private log(level: LogLevel, args: unknown[]): void {
    const minLevel = getMinLogLevel();
    if (LOG_LEVELS[level] < minLevel) {
      return;
    }

    const timestamp = formatTimestamp();
    const levelStr = formatLevel(level);
    const serviceStr = formatService(this.service, this.id);
    const message = formatArgs(args);

    const parts = [timestamp, levelStr];
    if (serviceStr) {
      parts.push(serviceStr);
    }
    parts.push(message);

    const output = parts.join(" ");

    // Use appropriate console method
    switch (level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }

  debug(...args: unknown[]): void {
    this.log("debug", args);
  }

  info(...args: unknown[]): void {
    this.log("info", args);
  }

  warn(...args: unknown[]): void {
    this.log("warn", args);
  }

  error(...args: unknown[]): void {
    this.log("error", args);
  }
}

// Default logger singleton (no service context)
export const logger = new Logger();

// Factory function for creating service-scoped loggers
export const createLogger = (name: string, id?: string): Logger => logger.forService(name, id);
