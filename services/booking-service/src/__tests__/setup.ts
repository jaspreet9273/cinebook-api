process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/cinebook_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.KAFKA_BROKERS = "localhost:9092";
process.env.RABBITMQ_URL = "amqp://admin:password@localhost:5672/cinebook";
process.env.JWT_SECRET = "test_secret_that_is_at_least_32_characters_long";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret_32_characters_long_here";
process.env.SEAT_HOLD_MINUTES = "10";
