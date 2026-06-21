import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

const SLOW_REQUEST_THRESHOLD_MS = 5_000;

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("finish", () => {
    const durationMs = req.startTime ? Date.now() - req.startTime : -1;

    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[level]("HTTP", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      correlationId: req.correlationId,
      userId: req.gatewayUserId,
      role: req.gatewayUserRole,
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
        userId: req.gatewayUserId,
      });
    }
  });

  next();
}
