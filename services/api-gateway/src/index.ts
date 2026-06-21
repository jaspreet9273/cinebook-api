import "dotenv/config";

import express, {
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { createProxyMiddleware } from "http-proxy-middleware";
import http from "http";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec, swaggerOptions } from "./docs/swagger";

import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";
import { rateLimiter } from "./middleware/rate-limiter";
import { authenticate } from "./middleware/auth";
import { correlationId } from "./middleware/correlation-id";
import { healthRouter } from "./routes/health";
import { logger } from "./config/logger";
import { env } from "./config/env";
import { connectRedis, disconnectRedis } from "./config/redis";
import { getBreaker } from "./config/circuit-breaker";

const app = express();

app.set("trust proxy", env.TRUST_PROXY);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    crossOriginEmbedderPolicy: false,
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.CORS_ORIGINS.includes(origin) || env.CORS_ORIGINS.includes("*")) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-Id",
      "X-Idempotency-Key",
    ],
    exposedHeaders: [
      "X-Correlation-Id",
      "X-Request-Id",
      "RateLimit-Limit",
      "RateLimit-Remaining",
    ],
    maxAge: 86400,
  }),
);

app.use(compression({ level: 6, threshold: 1024 }));

// ─── Observability ────────────────────────────────────────────────────────────
app.use(correlationId);
app.use(requestLogger);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use("/api/", rateLimiter.general);
app.use("/api/auth/", rateLimiter.auth);
app.use("/api/bookings/", rateLimiter.booking);
app.use("/api/payments/", rateLimiter.payment);

// ─── Health ───────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);

// ─── API Docs ─────────────────────────────────────────────────────────────────
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, swaggerOptions),
);
app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));

// ─── Proxy factory ────────────────────────────────────────────────────────────
function createProxy(serviceUrl: string, serviceName: string): RequestHandler {
  const breaker = getBreaker(serviceName);

  const proxy = createProxyMiddleware({
    target: serviceUrl,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
      const r = req as any;
      // Restore full path — Express strips mount prefix before proxy sees it
      proxyReq.path = r.originalUrl;

      if (r.user) {
        proxyReq.setHeader("X-User-Id", r.user.id);
        proxyReq.setHeader("X-User-Email", r.user.email);
        proxyReq.setHeader("X-User-Role", r.user.role);
      }
      proxyReq.setHeader("X-Correlation-Id", r.correlationId ?? "");
      proxyReq.setHeader("X-Forwarded-For", r.ip ?? "");
      proxyReq.setHeader("X-Gateway-Time", Date.now().toString());

      logger.debug("Proxying request", {
        service: serviceName,
        method: r.method,
        path: r.originalUrl,
      });
    },
    onProxyRes: () => {
      breaker.recordSuccess();
    },
    onError: (err, _req, res) => {
      breaker.recordFailure();
      logger.error("Proxy error", {
        service: serviceName,
        error: (err as Error).message,
      });
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Downstream service unavailable",
            code: "PROXY_ERROR",
          }),
        );
      }
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    if (breaker.isOpen()) {
      res.status(502).json({
        error: `${serviceName} is temporarily unavailable`,
        code: "CIRCUIT_OPEN",
        correlationId: req.correlationId,
      });
      return;
    }
    // v2 returns a standard Express RequestHandler — cast needed due to type mismatch
    // between http-proxy-middleware's IncomingMessage and Express's Request
    (proxy as unknown as RequestHandler)(req, res, next);
  };
}

// ─── Public routes ────────────────────────────────────────────────────────────
app.use("/api/auth", createProxy(env.USER_SERVICE_URL, "user-service"));
// Shows — public GET, authenticated POST/DELETE
app.use(
  "/api/shows",
  (req, res, next) => {
    if (req.method === "GET") return next();
    authenticate(req, res, next);
  },
  createProxy(env.SHOW_SERVICE_URL, "show-service"),
);
// Theatres — public GET, authenticated POST/PATCH
app.use(
  "/api/theatres",
  (req, res, next) => {
    if (req.method === "GET") return next();
    authenticate(req, res, next);
  },
  createProxy(env.SHOW_SERVICE_URL, "show-service"),
);
// Movies — public GET, authenticated POST/PATCH/DELETE
app.use(
  "/api/movies",
  (req, res, next) => {
    if (req.method === "GET") return next();
    authenticate(req, res, next);
  },
  createProxy(env.SHOW_SERVICE_URL, "show-service"),
);

// ─── Protected routes ─────────────────────────────────────────────────────────
app.use(
  "/api/users",
  authenticate,
  createProxy(env.USER_SERVICE_URL, "user-service"),
);
app.use(
  "/api/bookings",
  authenticate,
  createProxy(env.BOOKING_SERVICE_URL, "booking-service"),
);
app.use(
  "/api/payments",
  authenticate,
  createProxy(env.PAYMENT_SERVICE_URL, "payment-service"),
);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found", code: "NOT_FOUND" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await connectRedis();

  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.listen(env.PORT, () => {
    logger.info("🚀 API Gateway ready", {
      port: env.PORT,
      env: env.NODE_ENV,
      services: {
        user: env.USER_SERVICE_URL,
        booking: env.BOOKING_SERVICE_URL,
        payment: env.PAYMENT_SERVICE_URL,
        show: env.SHOW_SERVICE_URL,
      },
    });
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — starting graceful shutdown`);

    server.close(async () => {
      logger.info("HTTP server closed — draining connections");
      // Disconnect Redis cleanly
      await disconnectRedis();
      logger.info("Shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
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
    if (env.NODE_ENV !== "production") process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
  });
}

start().catch((err) => {
  logger.error("Failed to start API Gateway", { error: err });
  process.exit(1);
});

export default app;
