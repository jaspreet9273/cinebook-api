import winston from "winston";
import { env } from "./env";

// Fields that must never appear in logs
const SENSITIVE_FIELDS = new Set([
  "password",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "authorization",
  "cvv",
  "cardnumber",
  "x-api-key",
]);

/**
 * Recursively redact sensitive keys from any depth of a log object.
 * Keys are compared lowercase so "Password", "PASSWORD" etc. are all caught.
 */
function redact(obj: any, depth = 0): any {
  if (depth > 5 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));

  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      SENSITIVE_FIELDS.has(k.toLowerCase())
        ? "[REDACTED]"
        : redact(v, depth + 1),
    ]),
  );
}

const redactFormat = winston.format((info) => {
  // Redact the entire info object in place
  // We preserve the Winston symbol fields (level, message) by spreading after
  const redacted = redact(info);
  return Object.assign(info, redacted);
});

const consoleTransport = new winston.transports.Console({
  format: env.IS_PRODUCTION
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
});

export const logger = winston.createLogger({
  level: env.IS_PRODUCTION ? "info" : "debug",
  format: winston.format.combine(
    redactFormat(),
    winston.format.errors({ stack: true }),
    winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
    winston.format.json(),
  ),
  defaultMeta: {
    service: "api-gateway",
    env: env.NODE_ENV,
    pid: process.pid,
  },
  transports: [consoleTransport],

  exceptionHandlers: [consoleTransport],
  rejectionHandlers: [consoleTransport],

  // Don't exit on handled exceptions
  exitOnError: false,
});
