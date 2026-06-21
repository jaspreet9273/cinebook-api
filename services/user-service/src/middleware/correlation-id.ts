import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

// UUID v4 / alphanumeric correlation IDs only — reject anything suspicious
const CORRELATION_ID_REGEX = /^[a-zA-Z0-9\-_]{8,64}$/;

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
      // Gateway-injected user context (set by API gateway after JWT verification)
      gatewayUserId?: string;
      gatewayUserRole?: string;
    }
  }
}

/**
 * Injects correlation ID and start time into every request.
 * Also extracts gateway-forwarded user context from headers into typed fields.
 */
export function correlationId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Sanitize incoming correlation ID — never trust raw client input
  const incoming = (req.headers["x-correlation-id"] as string)?.trim();
  const id =
    incoming && CORRELATION_ID_REGEX.test(incoming) ? incoming : uuidv4();

  req.correlationId = id;
  req.startTime = Date.now();

  // Extract gateway-forwarded user context into typed fields
  req.gatewayUserId = req.headers["x-user-id"] as string | undefined;
  req.gatewayUserRole = req.headers["x-user-role"] as string | undefined;

  res.setHeader("X-Correlation-Id", id);
  next();
}
