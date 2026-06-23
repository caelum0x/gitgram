import { Request, Response, NextFunction } from "express";

/**
 * Structured request log entry shape
 */
interface RequestLogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userAgent: string;
  ip: string;
}

// ANSI color codes for development output
const COLOR = {
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  reset:  "\x1b[0m",
} as const;

/**
 * Pick a color based on HTTP status code category.
 * 2xx → green, 4xx → yellow, 5xx → red, other → no color.
 */
function statusColor(status: number): string {
  if (status >= 500) return COLOR.red;
  if (status >= 400) return COLOR.yellow;
  if (status >= 200 && status < 300) return COLOR.green;
  return COLOR.reset;
}

/**
 * Write one log entry.
 * Development: single colorized line to stdout.
 * Production: compact JSON line to stdout (for log aggregators).
 */
function writeEntry(entry: RequestLogEntry): void {
  if (process.env.NODE_ENV === "development") {
    const color = statusColor(entry.status);
    const line = [
      entry.timestamp,
      `${color}${entry.method}${COLOR.reset}`,
      entry.path,
      `${color}${entry.status}${COLOR.reset}`,
      `${entry.durationMs}ms`,
    ].join(" ");
    // eslint-disable-next-line no-console
    console.log(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }
}

/**
 * Express request-logging middleware.
 *
 * Logs method, path, status code, duration, user-agent, and client IP for
 * every request that completes. Skips /health to keep noise low.
 *
 * Usage:
 *   app.use(requestLogger());
 */
export function requestLogger() {
  return function requestLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Skip health checks to avoid log spam
    if (req.path === "/health" || req.path.startsWith("/health/")) {
      return next();
    }

    const startedAt = Date.now();

    res.on("finish", () => {
      const entry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        method:    req.method,
        path:      req.originalUrl || req.path,
        status:    res.statusCode,
        durationMs: Date.now() - startedAt,
        userAgent: req.get("User-Agent") ?? "",
        ip:
          (req.headers["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            ?.trim() ??
          req.socket?.remoteAddress ??
          "",
      };

      writeEntry(entry);
    });

    next();
  };
}

export default requestLogger;
