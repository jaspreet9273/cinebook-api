import Joi from "joi";

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3001),
  MONGODB_URI: Joi.string().default("mongodb://localhost:27017/movie_booking"),
  REDIS_URL: Joi.string().default("redis://localhost:6379"),
  KAFKA_BROKERS: Joi.string().default("localhost:9092"),
  RABBITMQ_URL: Joi.string().default(
    "amqp://admin:password@localhost:5672/cinebook",
  ),
  TRUSTED_ORIGINS: Joi.string().default("http://localhost:3000"),

  // Seat hold window in minutes — how long a booking stays 'pending' before expiry
  SEAT_HOLD_MINUTES: Joi.number().min(1).max(30).default(10),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false });
if (error) {
  console.error("❌ Booking service env error:");
  error.details.forEach((d) => console.error(`  - ${d.message}`));
  process.exit(1);
}

export const env = {
  NODE_ENV: value.NODE_ENV as string,
  IS_PRODUCTION: value.NODE_ENV === "production",
  PORT: value.PORT as number,
  MONGODB_URI: value.MONGODB_URI as string,
  REDIS_URL: value.REDIS_URL as string,
  KAFKA_BROKERS: (value.KAFKA_BROKERS as string)
    .split(",")
    .map((s: string) => s.trim()),
  RABBITMQ_URL: value.RABBITMQ_URL as string,
  TRUSTED_ORIGINS: (value.TRUSTED_ORIGINS as string)
    .split(",")
    .map((s: string) => s.trim()),
  SEAT_HOLD_MINUTES: value.SEAT_HOLD_MINUTES as number,
};
