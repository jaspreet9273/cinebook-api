import "dotenv/config";
import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import mongoose from "mongoose";
import http from "http";

import { authRouter } from "./routes/auth";
import { userRouter } from "./routes/user";
import { errorHandler } from "./middleware/error-handler";
import { correlationId } from "./middleware/correlation-id";
import { requestLogger } from "./middleware/request-logger";
import { logger } from "./config/logger";
import { env } from "./config/env";

const app = express();

// ─── Trust proxy — gateway sits in front ─────────────────────────────────────
app.set("trust proxy", 1);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // API service — no HTML served
  }),
);

app.use(
  cors({
    origin: env.TRUSTED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-Id",
      "X-User-Id",
      "X-User-Role",
    ],
  }),
);

app.use(compression());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Observability ────────────────────────────────────────────────────────────
app.use(correlationId);
app.use(requestLogger);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "user-service",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found", code: "NOT_FOUND" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
    heartbeatFrequencyMS: 10_000,
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  logger.info("MongoDB connected");

  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.listen(env.PORT, () => {
    logger.info("👤 User Service ready", {
      port: env.PORT,
      env: env.NODE_ENV,
    });
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} — shutting down`);
    server.close(async () => {
      try {
        await mongoose.disconnect();
        logger.info("MongoDB disconnected");
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
    }, 15_000).unref();
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

// Only bootstrap when not in test environment
if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((err) => {
    logger.error("Failed to start user service", {
      error: (err as Error).message,
    });
    process.exit(1);
  });
}

export default app;
