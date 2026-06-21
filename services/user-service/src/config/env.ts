import Joi from "joi";

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3004),
  MONGODB_URI: Joi.string().default("mongodb://localhost:27017/movie_booking"),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),
  TRUSTED_ORIGINS: Joi.string().default("http://localhost:3000"),
  BCRYPT_ROUNDS: Joi.number().min(4).max(12).default(10),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false });
if (error) {
  console.error("❌ User service env error:");
  error.details.forEach((d) => console.error(`  - ${d.message}`));
  process.exit(1);
}

export const env = {
  NODE_ENV: value.NODE_ENV as string,
  IS_PRODUCTION: value.NODE_ENV === "production",
  PORT: value.PORT as number,
  MONGODB_URI: value.MONGODB_URI as string,
  JWT_SECRET: value.JWT_SECRET as string,
  JWT_REFRESH_SECRET: value.JWT_REFRESH_SECRET as string,
  JWT_EXPIRES_IN: value.JWT_EXPIRES_IN as string,
  JWT_REFRESH_EXPIRES_IN: value.JWT_REFRESH_EXPIRES_IN as string,
  TRUSTED_ORIGINS: (value.TRUSTED_ORIGINS as string)
    .split(",")
    .map((s: string) => s.trim()),
  BCRYPT_ROUNDS: value.BCRYPT_ROUNDS as number,
};
