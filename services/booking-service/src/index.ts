import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import mongoose from "mongoose";
import { createClient, RedisClientType } from "redis";
import http from "http";

import {
  bookingController,
  createBookingValidation,
} from "./controllers/booking";
import { errorHandler } from "./middleware/error-handler";
import { correlationId } from "./middleware/correlation-id";
import { requestLogger } from "./middleware/request-logger";
import { kafkaProducer } from "./events/kafka-producer";
import { rabbitPublisher } from "./events/rabbit-publisher";
import { bookingService } from "./services/booking";
import { startExpiryWorker, stopExpiryWorker } from "./services/expiry-worker";
import { logger } from "./config/logger";
import { env } from "./config/env";

const app = express();

// ─── Trust proxy ──────────────────────────────────────────────────────────────
app.set("trust proxy", 1);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }),
);
app.use(
  cors({
    origin: env.TRUSTED_ORIGINS,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-Correlation-Id",
      "X-User-Id",
      "X-User-Role",
      "X-Idempotency-Key",
    ],
  }),
);
app.use(compression());
app.use(express.json({ limit: "5kb" }));
app.use(express.urlencoded({ extended: true, limit: "5kb" }));

// ─── Observability ────────────────────────────────────────────────────────────
app.use(correlationId);
app.use(requestLogger);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "booking-service",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.post(
  "/api/bookings",
  createBookingValidation,
  (req: Request, res: Response, next: NextFunction) =>
    bookingController.create(req, res, next),
);
app.get("/api/bookings", (req: Request, res: Response, next: NextFunction) =>
  bookingController.listUserBookings(req, res, next),
);
app.get(
  "/api/bookings/:bookingId",
  (req: Request, res: Response, next: NextFunction) =>
    bookingController.getById(req, res, next),
);
app.delete(
  "/api/bookings/:bookingId",
  (req: Request, res: Response, next: NextFunction) =>
    bookingController.cancel(req, res, next),
);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found", code: "NOT_FOUND" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // MongoDB
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5_000,
    heartbeatFrequencyMS: 10_000,
  });
  logger.info("MongoDB connected");

  // Redis
  const redis = createClient({ url: env.REDIS_URL }) as RedisClientType;
  redis.on("error", (err) =>
    logger.error("Redis error", { error: err.message }),
  );
  redis.on("reconnecting", () => logger.warn("Redis reconnecting"));
  await redis.connect();
  logger.info("Redis connected");
  await bookingService.init(redis);

  // Kafka
  await kafkaProducer.connect();

  // RabbitMQ
  await rabbitPublisher.connect();

  // Exipry worker
  startExpiryWorker();

  // HTTP server
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.listen(env.PORT, () => {
    logger.info("🎬 Booking Service ready", {
      port: env.PORT,
      env: env.NODE_ENV,
    });
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} — shutting down`);
    server.close(async () => {
      try {
        stopExpiryWorker();
        await kafkaProducer.disconnect();
        await rabbitPublisher.disconnect();
        await redis.disconnect();
        await mongoose.disconnect();
        logger.info("Shutdown complete");
      } catch (err) {
        logger.error("Error during shutdown", {
          error: (err as Error).message,
        });
      }
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Shutdown timed out — forcing exit");
      process.exit(1);
    }, 30_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", {
      error: err.message,
      stack: err.stack,
    });
    if (!env.IS_PRODUCTION) process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to start booking service", {
    error: (err as Error).message,
  });
  process.exit(1);
});

export default app;
