import Joi from "joi";

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  RABBITMQ_URL: Joi.string().default(
    "amqp://admin:password@localhost:5672/cinebook",
  ),

  // SMTP — leave blank to auto-use Ethereal in dev
  SMTP_HOST: Joi.string().default("smtp.ethereal.email"),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false), // true for port 465
  SMTP_USER: Joi.string().allow("").default(""),
  SMTP_PASS: Joi.string().allow("").default(""),
  EMAIL_FROM: Joi.string().default("noreply@cinebook.app"),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false });
if (error) {
  console.error("❌ Notification service env error:");
  error.details.forEach((d) => console.error(`  - ${d.message}`));
  process.exit(1);
}

export const env = {
  NODE_ENV: value.NODE_ENV as string,
  IS_PRODUCTION: value.NODE_ENV === "production",
  RABBITMQ_URL: value.RABBITMQ_URL as string,
  SMTP_HOST: value.SMTP_HOST as string,
  SMTP_PORT: value.SMTP_PORT as number,
  SMTP_SECURE: value.SMTP_SECURE as boolean,
  SMTP_USER: value.SMTP_USER as string,
  SMTP_PASS: value.SMTP_PASS as string,
  EMAIL_FROM: value.EMAIL_FROM as string,
};
