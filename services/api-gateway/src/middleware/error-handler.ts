import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";
import { env } from "../config/env";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Already responded (e.g. from proxy error handler)
  if (res.headersSent) return;

  const correlationId = req.correlationId ?? "unknown";

  if (err instanceof AppError && err.isOperational) {
    logger.warn("Operational error", {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      correlationId,
      path: req.path,
      method: req.method,
    });
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      correlationId,
    });
    return;
  }

  // Unexpected / programmer error — log full detail
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    correlationId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: "An unexpected error occurred",
    correlationId,
    ...(!env.IS_PRODUCTION && {
      detail: err.message,
      stack: err.stack,
    }),
  });
}
