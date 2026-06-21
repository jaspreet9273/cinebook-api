import { Router, Request, Response } from "express";
import { getRedis } from "../config/redis";
import { getAllBreakerStats } from "../config/circuit-breaker";

export const healthRouter = Router();

const HEAP_WARN_MB = 400;

interface HealthCheck {
  status: "ok" | "degraded";
  latencyMs?: number;
  detail?: string;
}

/**
 * GET /health
 * Liveness probe — process is alive.
 * Must be instant — no I/O, no dependencies.
 */
healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "api-gateway",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
});

/**
 * GET /health/ready
 * Readiness probe — is the service ready to accept traffic?
 *
 * Returns:
 *  200 — ok or degraded (still serving, some deps slow/missing)
 *  503 — all circuit breakers open (cannot serve any downstream requests)
 */
healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const checks: Record<string, HealthCheck> = {};
  let overallStatus: "ok" | "degraded" = "ok";

  // ── Redis ──────────────────────────────────────────────────────────────────
  const redisStart = Date.now();
  try {
    const redis = getRedis();
    if (redis) {
      await redis.ping();
      checks.redis = { status: "ok", latencyMs: Date.now() - redisStart };
    } else {
      checks.redis = {
        status: "degraded",
        detail: "not connected — token blacklist disabled",
      };
      overallStatus = "degraded";
    }
  } catch (err) {
    checks.redis = { status: "degraded", detail: (err as Error).message };
    overallStatus = "degraded";
  }

  // ── Circuit breakers ───────────────────────────────────────────────────────
  const breakerStats = getAllBreakerStats();
  const openBreakers = Object.entries(breakerStats).filter(
    ([, s]) => s.state === "open",
  );
  const allOpen =
    openBreakers.length === Object.keys(breakerStats).length &&
    openBreakers.length > 0;

  checks.circuitBreakers = {
    status: openBreakers.length > 0 ? "degraded" : "ok",
    detail:
      openBreakers.length > 0
        ? `${openBreakers.map(([s]) => s).join(", ")} open`
        : undefined,
  };
  if (openBreakers.length > 0) overallStatus = "degraded";

  // ── Memory ─────────────────────────────────────────────────────────────────
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMb = Math.round(mem.rss / 1024 / 1024);

  checks.memory = {
    status: heapUsedMb > HEAP_WARN_MB ? "degraded" : "ok",
    detail: `${heapUsedMb}MB / ${heapTotalMb}MB heap`,
  };
  if (heapUsedMb > HEAP_WARN_MB) overallStatus = "degraded";

  // Only 503 if ALL circuit breakers are open — truly can't serve anything
  const statusCode = allOpen ? 503 : 200;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks,
    circuitBreakers: breakerStats,
    memory: { heapUsedMb, heapTotalMb, rssMb },
  });
});

/**
 * GET /health/metrics
 * Prometheus text format — scrape with Prometheus or view in browser.
 */
healthRouter.get("/metrics", (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const breakers = getAllBreakerStats();

  const lines = [
    "# HELP process_uptime_seconds Process uptime in seconds",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${process.uptime().toFixed(2)}`,

    "# HELP process_heap_used_bytes Heap used in bytes",
    "# TYPE process_heap_used_bytes gauge",
    `process_heap_used_bytes ${mem.heapUsed}`,

    "# HELP process_heap_total_bytes Heap total in bytes",
    "# TYPE process_heap_total_bytes gauge",
    `process_heap_total_bytes ${mem.heapTotal}`,

    "# HELP process_rss_bytes Resident set size in bytes",
    "# TYPE process_rss_bytes gauge",
    `process_rss_bytes ${mem.rss}`,

    "# HELP circuit_breaker_state Circuit breaker state (0=closed, 1=half-open, 2=open)",
    "# TYPE circuit_breaker_state gauge",
    ...Object.entries(breakers).map(([svc, s]) => {
      const v = s.state === "closed" ? 0 : s.state === "half-open" ? 1 : 2;
      return `circuit_breaker_state{service="${svc}"} ${v}`;
    }),

    "# HELP circuit_breaker_failures_total Total connection failures per service",
    "# TYPE circuit_breaker_failures_total counter",
    ...Object.entries(breakers).map(
      ([svc, s]) =>
        `circuit_breaker_failures_total{service="${svc}"} ${s.totalFailures}`,
    ),

    "# HELP circuit_breaker_rejected_total Requests rejected while breaker was open",
    "# TYPE circuit_breaker_rejected_total counter",
    ...Object.entries(breakers).map(
      ([svc, s]) =>
        `circuit_breaker_rejected_total{service="${svc}"} ${s.totalRejected}`,
    ),
  ];

  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(lines.join("\n") + "\n");
});
