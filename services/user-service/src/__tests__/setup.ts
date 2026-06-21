process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/cinebook_test";
process.env.JWT_SECRET = "test_secret_that_is_at_least_32_characters_long";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret_at_least_32_chars_long_x";
process.env.JWT_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.TRUSTED_ORIGINS = "http://localhost:3000";
process.env.BCRYPT_ROUNDS = "4"; // low rounds for fast tests
