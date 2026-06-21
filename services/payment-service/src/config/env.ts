import Joi from "joi";

const isTest = process.env.NODE_ENV === "test";

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3002),
  MONGODB_URI: Joi.string().default("mongodb://localhost:27017/movie_booking"),
  KAFKA_BROKERS: Joi.string().default("localhost:9092"),

  // Optional in test — real keys needed for dev/prod
  RAZORPAY_KEY_ID: isTest
    ? Joi.string().default("rzp_test_dummy")
    : Joi.string().required(),
  RAZORPAY_KEY_SECRET: isTest
    ? Joi.string().default("dummy_secret_32_chars_xxxxxxxxxx")
    : Joi.string().required(),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().default("webhook_secret_change_me"),

  TRUSTED_ORIGINS: Joi.string().default("http://localhost:3000"),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false });
if (error) {
  console.error("❌ Payment service env error:");
  error.details.forEach((d) => console.error(`  - ${d.message}`));
  process.exit(1);
}

export const env = {
  NODE_ENV: value.NODE_ENV as string,
  IS_PRODUCTION: value.NODE_ENV === "production",
  PORT: value.PORT as number,
  MONGODB_URI: value.MONGODB_URI as string,
  KAFKA_BROKERS: (value.KAFKA_BROKERS as string)
    .split(",")
    .map((s: string) => s.trim()),
  RAZORPAY_KEY_ID: value.RAZORPAY_KEY_ID as string,
  RAZORPAY_KEY_SECRET: value.RAZORPAY_KEY_SECRET as string,
  RAZORPAY_WEBHOOK_SECRET: value.RAZORPAY_WEBHOOK_SECRET as string,
  TRUSTED_ORIGINS: (value.TRUSTED_ORIGINS as string)
    .split(",")
    .map((s: string) => s.trim()),
};
