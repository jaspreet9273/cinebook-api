import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

const ADMIN_ROLES = ["admin", "theatre_owner"] as const;

/**
 * Validates that the request comes from an admin or theatre_owner.
 * X-User-Role is forwarded by the API gateway after JWT verification.
 * Protects write operations on movies, theatres, and shows.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = (req.headers["x-user-role"] as string)?.trim();
  const userId = (req.headers["x-user-id"] as string)?.trim();

  if (!role || !userId) {
    res
      .status(401)
      .json({ error: "Unauthorized", code: "MISSING_USER_CONTEXT" });
    return;
  }

  if (!ADMIN_ROLES.includes(role as any)) {
    logger.warn("Admin access denied", {
      userId,
      role,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
    });
    res.status(403).json({
      error: "Admin or theatre owner access required",
      code: "FORBIDDEN",
    });
    return;
  }

  next();
}
