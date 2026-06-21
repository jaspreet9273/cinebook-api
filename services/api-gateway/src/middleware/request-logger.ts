import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

const SLOW_REQUEST_THRESHOLD_MS = 5_000;

/**
 * Structured HTTP request/response logger.
 * Logs on response finish — never before, so we always have the status code.
 *
 * Log levels:
 *  5xx → error
 *  4xx → warn
 *  2xx/3xx → info
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("finish", () => {
    const durationMs = req.startTime ? Date.now() - req.startTime : -1; // -1 signals correlationId middleware didn't run

    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[level]("HTTP", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      correlationId: req.correlationId,
      userId: req.user?.id,
      role: req.user?.role,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      contentLength: res.get("content-length"),
    });

    if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
      logger.warn("Slow response", {
        method: req.method,
        path: req.path,
        durationMs,
        statusCode: res.statusCode,
        userId: req.user?.id,
      });
    }
  });

  next();
}
