import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "user" | "admin" | "theatre_owner";
        iat: number;
        exp: number;
      };
      correlationId: string;
      startTime: number;
    }
  }
}

// UUID v4 regex — reject anything that doesn't look like a valid correlation ID
const CORRELATION_ID_REGEX = /^[a-zA-Z0-9\-_]{8,64}$/;

/**
 * Injects a correlation ID into every request for distributed tracing.
 * - Reuses X-Correlation-Id from client if present and valid
 * - Generates new UUID v4 if missing or invalid (never trust raw client input)
 * - Stamps req.startTime for latency tracking
 */
export function correlationId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = (req.headers["x-correlation-id"] as string)?.trim();
  const id =
    incoming && CORRELATION_ID_REGEX.test(incoming) ? incoming : uuidv4();

  req.correlationId = id;
  req.startTime = Date.now();

  res.setHeader("X-Correlation-Id", id);
  res.setHeader("X-Request-Id", id);
  next();
}
