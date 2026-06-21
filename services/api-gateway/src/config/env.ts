import Joi from "joi";

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3000),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),

  // Downstream services — notification has no HTTP port, excluded intentionally
  USER_SERVICE_URL: Joi.string().uri().default("http://localhost:3004"),
  BOOKING_SERVICE_URL: Joi.string().uri().default("http://localhost:3001"),
  PAYMENT_SERVICE_URL: Joi.string().uri().default("http://localhost:3002"),
  SHOW_SERVICE_URL: Joi.string().uri().default("http://localhost:3003"),

  REDIS_URL: Joi.string().default("redis://localhost:6379"),
  CORS_ORIGINS: Joi.string().default("http://localhost:5173"),

  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: Joi.number().default(100),

  CB_FAILURE_THRESHOLD: Joi.number().default(5),
  CB_RECOVERY_TIMEOUT_MS: Joi.number().default(30_000),

  TRUST_PROXY: Joi.number().default(1),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false });
if (error) {
  console.error("❌ API Gateway env error:");
  error.details.forEach((d) => console.error(`  - ${d.message}`));
  process.exit(1);
}

export const env = {
  NODE_ENV: value.NODE_ENV as string,
  IS_PRODUCTION: value.NODE_ENV === "production",
  PORT: value.PORT as number,

  JWT_SECRET: value.JWT_SECRET as string,
  JWT_REFRESH_SECRET: value.JWT_REFRESH_SECRET as string,
  JWT_EXPIRES_IN: value.JWT_EXPIRES_IN as string,
  JWT_REFRESH_EXPIRES_IN: value.JWT_REFRESH_EXPIRES_IN as string,

  USER_SERVICE_URL: value.USER_SERVICE_URL as string,
  BOOKING_SERVICE_URL: value.BOOKING_SERVICE_URL as string,
  PAYMENT_SERVICE_URL: value.PAYMENT_SERVICE_URL as string,
  SHOW_SERVICE_URL: value.SHOW_SERVICE_URL as string,

  REDIS_URL: value.REDIS_URL as string,
  CORS_ORIGINS: (value.CORS_ORIGINS as string)
    .split(",")
    .map((s: string) => s.trim()),

  RATE_LIMIT_WINDOW_MS: value.RATE_LIMIT_WINDOW_MS as number,
  RATE_LIMIT_MAX: value.RATE_LIMIT_MAX as number,

  CB_FAILURE_THRESHOLD: value.CB_FAILURE_THRESHOLD as number,
  CB_RECOVERY_TIMEOUT_MS: value.CB_RECOVERY_TIMEOUT_MS as number,

  TRUST_PROXY: value.TRUST_PROXY as number,
};
