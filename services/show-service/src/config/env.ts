import Joi from "joi";

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3003),
  MONGODB_URI: Joi.string().default("mongodb://localhost:27017/movie_booking"),
  TRUSTED_ORIGINS: Joi.string().default("http://localhost:3000"),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false });
if (error) {
  console.error("❌ Show service env error:");
  error.details.forEach((d) => console.error(`  - ${d.message}`));
  process.exit(1);
}

export const env = {
  NODE_ENV: value.NODE_ENV as string,
  IS_PRODUCTION: value.NODE_ENV === "production",
  PORT: value.PORT as number,
  MONGODB_URI: value.MONGODB_URI as string,
  TRUSTED_ORIGINS: (value.TRUSTED_ORIGINS as string)
    .split(",")
    .map((s: string) => s.trim()),
};
