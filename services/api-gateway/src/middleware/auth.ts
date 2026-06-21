import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { redisGet } from "../config/redis";

type UserRole = "user" | "admin" | "theatre_owner";

interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Hash a token for use as a Redis key.
 * Keeps keys short and prevents raw tokens appearing in Redis logs/snapshots.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * JWT authentication middleware.
 *
 * Checks:
 *  1. Authorization header present and well-formed
 *  2. Token structure is valid (3 parts)
 *  3. Token not blacklisted in Redis (logout/revocation support)
 *  4. JWT signature valid and not expired
 *  5. Payload has required fields
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Missing or malformed Authorization header",
        code: "MISSING_TOKEN",
      });
      return;
    }

    const token = authHeader.slice(7);

    if (!token || token.split(".").length !== 3) {
      res
        .status(401)
        .json({ error: "Malformed token", code: "MALFORMED_TOKEN" });
      return;
    }

    // Check blacklist using hashed token as key
    const tokenHash = hashToken(token);
    const isRevoked = await redisGet(`blacklist:${tokenHash}`);
    if (isRevoked) {
      res
        .status(401)
        .json({ error: "Token has been revoked", code: "TOKEN_REVOKED" });
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    if (!payload.id || !payload.email || !payload.role) {
      res
        .status(401)
        .json({ error: "Invalid token payload", code: "INVALID_PAYLOAD" });
      return;
    }

    req.user = payload;

    logger.debug("Authenticated", {
      userId: payload.id,
      role: payload.role,
      correlationId: req.correlationId,
    });

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    } else if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid token", code: "INVALID_TOKEN" });
    } else if (err instanceof jwt.NotBeforeError) {
      res
        .status(401)
        .json({ error: "Token not yet valid", code: "TOKEN_NOT_ACTIVE" });
    } else {
      // Only log message — never log the full error object (may contain secrets)
      logger.error("Auth middleware unexpected error", {
        message: (err as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * Role-based authorization middleware.
 * Must be used AFTER authenticate.
 * Usage: router.delete('/users/:id', authenticate, authorize('admin'), handler)
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHENTICATED" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      logger.warn("Authorization denied", {
        userId: req.user.id,
        role: req.user.role,
        required: roles,
        correlationId: req.correlationId,
      });
      res
        .status(403)
        .json({ error: "Insufficient permissions", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}
