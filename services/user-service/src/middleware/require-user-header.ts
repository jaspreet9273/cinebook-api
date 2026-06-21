import { Request, Response, NextFunction } from "express";

/**
 * Validates that gateway-forwarded user context headers are present.
 * X-User-Id and X-User-Role are injected by the API gateway after JWT verification.
 * Guards against direct calls that bypass the gateway.
 */
export function requireUserHeader(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = (req.headers["x-user-id"] as string)?.trim();
  const role = (req.headers["x-user-role"] as string)?.trim();

  if (!userId || !role) {
    res.status(401).json({
      error: "Unauthorized",
      code: "MISSING_USER_CONTEXT",
    });
    return;
  }

  next();
}
