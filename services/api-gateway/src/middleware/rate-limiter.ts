import rateLimit, { Options } from "express-rate-limit";
import { env } from "../config/env";
import { logger } from "../config/logger";

// ─── Production Redis store (uncomment when scaling to multiple instances) ────
// With in-memory store, each instance has its own counter — limits are per-pod.
// With Redis store, limits are shared across all instances.
//
// npm install rate-limit-redis
// import { RedisStore } from "rate-limit-redis";
// import { getRedis } from "../config/redis";
//
// const redisStore = new RedisStore({
//   sendCommand: (...args: string[]) => getRedis()!.sendCommand(args),
// });
// Then add `store: redisStore` to each rateLimit config below.
// ─────────────────────────────────────────────────────────────────────────────

function makeHandler(code: string, message: string) {
  return (req: any, res: any) => {
    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      path: req.path,
      code,
      correlationId: req.correlationId,
    });
    res.status(429).json({
      error: message,
      code,
      retryAfter: res.getHeader("Retry-After"),
    });
  };
}

const base: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,

  // req.ip is already the real IP because we set `trust proxy` in index.ts
  // No need to manually parse x-forwarded-for
  keyGenerator: (req) => req.ip ?? "unknown",
};

export const rateLimiter = {
  // General API: 100 req / 15 min
  general: rateLimit({
    ...base,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    handler: makeHandler(
      "RATE_LIMITED",
      "Too many requests. Please slow down.",
    ),
  }),

  // Auth: 10 req / 15 min — brute-force protection
  auth: rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000,
    max: 10,
    handler: makeHandler(
      "AUTH_RATE_LIMITED",
      "Too many auth attempts. Try again in 15 minutes.",
    ),
  }),

  // Booking: 20 req / 5 min — prevent seat hoarding bots
  booking: rateLimit({
    ...base,
    windowMs: 5 * 60 * 1000,
    max: 20,
    handler: makeHandler("BOOKING_RATE_LIMITED", "Too many booking attempts."),
  }),

  // Payment: 10 req / 10 min — financial endpoint extra caution
  payment: rateLimit({
    ...base,
    windowMs: 10 * 60 * 1000,
    max: 10,
    handler: makeHandler("PAYMENT_RATE_LIMITED", "Too many payment attempts."),
  }),
};
