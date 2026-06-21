import { logger } from "./logger";
import { env } from "./env";

type CBState = "closed" | "open" | "half-open";

export interface CircuitBreakerStats {
  service: string;
  state: CBState;
  failures: number;
  lastFailureAt?: string; // ISO string — easier to serialize
  nextProbeAt?: string;
  totalRequests: number;
  totalFailures: number;
  totalRejected: number; // requests rejected while open
}

class CircuitBreaker {
  private state: CBState = "closed";
  private failures = 0;
  private lastFailureAt?: Date;
  private nextProbeAt?: Date;
  private probeInFlight = false; // prevents multiple simultaneous probes
  private totalRequests = 0;
  private totalFailures = 0;
  private totalRejected = 0;

  constructor(
    private readonly service: string,
    private readonly threshold = env.CB_FAILURE_THRESHOLD,
    private readonly recoveryMs = env.CB_RECOVERY_TIMEOUT_MS,
  ) {}

  /**
   * Returns true if the request should be rejected (breaker is open).
   * Returns false if the request should proceed (closed or half-open probe).
   */
  isOpen(): boolean {
    this.totalRequests++;

    if (this.state === "closed") return false;

    if (this.state === "open") {
      const now = new Date();
      if (this.nextProbeAt && now >= this.nextProbeAt && !this.probeInFlight) {
        // Transition to half-open and allow exactly one probe
        this.state = "half-open";
        this.probeInFlight = true;
        logger.info("Circuit breaker half-open — sending probe", {
          service: this.service,
        });
        return false;
      }
      // Still open — reject
      this.totalRejected++;
      this.totalRequests--; // don't count rejected requests as processed
      return true;
    }

    // half-open: probe already in flight — reject all others
    if (this.probeInFlight) {
      this.totalRejected++;
      this.totalRequests--;
      return true;
    }

    return false;
  }

  recordSuccess(): void {
    if (this.state !== "closed") {
      logger.info("Circuit breaker closed — service recovered", {
        service: this.service,
        previousState: this.state,
      });
      this.state = "closed";
      this.failures = 0;
      this.probeInFlight = false;
    }
  }

  recordFailure(): void {
    this.totalFailures++;
    this.failures++;
    this.lastFailureAt = new Date();
    this.probeInFlight = false; // probe failed — allow next probe after recoveryMs

    if (this.state === "half-open" || this.failures >= this.threshold) {
      this.state = "open";
      this.nextProbeAt = new Date(Date.now() + this.recoveryMs);
      logger.error("Circuit breaker OPEN", {
        service: this.service,
        failures: this.failures,
        threshold: this.threshold,
        nextProbeAt: this.nextProbeAt.toISOString(),
      });
    }
  }

  /** Manually reset — useful for admin endpoints or tests */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.probeInFlight = false;
    this.nextProbeAt = undefined;
    logger.info("Circuit breaker manually reset", { service: this.service });
  }

  stats(): CircuitBreakerStats {
    return {
      service: this.service,
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt?.toISOString(),
      nextProbeAt: this.nextProbeAt?.toISOString(),
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalRejected: this.totalRejected,
    };
  }
}

// One breaker per downstream service — module-level singleton map
const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(service: string): CircuitBreaker {
  if (!breakers.has(service)) {
    breakers.set(service, new CircuitBreaker(service));
  }
  return breakers.get(service)!;
}

export function getAllBreakerStats(): Record<string, CircuitBreakerStats> {
  const result: Record<string, CircuitBreakerStats> = {};
  breakers.forEach((b, k) => {
    result[k] = b.stats();
  });
  return result;
}

export function resetBreaker(service: string): boolean {
  const breaker = breakers.get(service);
  if (!breaker) return false;
  breaker.reset();
  return true;
}
