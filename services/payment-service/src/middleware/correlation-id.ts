import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

const CORRELATION_ID_REGEX = /^[a-zA-Z0-9\-_]{8,64}$/;

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
      gatewayUserId?: string;
      gatewayUserRole?: string;
    }
  }
}

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
  req.gatewayUserId = (req.headers["x-user-id"] as string)?.trim() || undefined;
  req.gatewayUserRole =
    (req.headers["x-user-role"] as string)?.trim() || undefined;

  res.setHeader("X-Correlation-Id", id);
  next();
}
