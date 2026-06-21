import winston from "winston";

const SENSITIVE_FIELDS = new Set([
  "password",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "authorization",
]);

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
  const redacted = redact(info);
  return Object.assign(info, redacted);
});

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";

const consoleTransport = new winston.transports.Console({
  format: isDevelopment
    ? winston.format.combine(winston.format.colorize(), winston.format.simple())
    : winston.format.json(),
});

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: winston.format.combine(
    redactFormat(),
    winston.format.errors({ stack: true }),
    winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
    winston.format.json(),
  ),
  defaultMeta: {
    service: "show-service",
    env: process.env.NODE_ENV,
    pid: process.pid,
  },
  transports: [consoleTransport],
  exceptionHandlers: [consoleTransport],
  rejectionHandlers: [consoleTransport],
  exitOnError: false,
});
