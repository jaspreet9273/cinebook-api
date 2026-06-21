import { createClient, RedisClientType } from "redis";
import { env } from "./env";
import { logger } from "./logger";

let client: RedisClientType | null = null;
let isShuttingDown = false;

export async function connectRedis(): Promise<void> {
  try {
    const c = createClient({
      url: env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (isShuttingDown) return false; // stop reconnecting on shutdown
          if (retries > 10) {
            logger.error("Redis max retries exceeded — giving up");
            return false; // false = stop retrying (v4 API)
          }
          const delay = Math.min(retries * 200, 3000);
          logger.warn(`Redis reconnecting in ${delay}ms`, { retries });
          return delay;
        },
        connectTimeout: 5000,
      },
    }) as RedisClientType;

    c.on("error", (err) => logger.warn("Redis error", { error: err.message }));
    c.on("reconnecting", () => logger.warn("Redis reconnecting"));
    c.on("ready", () => logger.info("Redis ready"));
    c.on("end", () => {
      if (!isShuttingDown) {
        // Unexpected disconnect — null the client so callers degrade gracefully
        logger.warn("Redis connection ended unexpectedly");
        client = null;
      }
    });

    await c.connect();
    client = c;
    logger.info("Redis connected");
  } catch (err) {
    logger.warn("Redis unavailable — token blacklist disabled", {
      error: (err as Error).message,
    });
    client = null;
  }
}

export async function disconnectRedis(): Promise<void> {
  isShuttingDown = true;
  if (client) {
    await client.disconnect();
    client = null;
    logger.info("Redis disconnected");
  }
}

/** Returns null if Redis is not connected — all callers must handle gracefully */
export function getRedis(): RedisClientType | null {
  return client;
}

/** Get a string value — returns null on miss or error */
export async function redisGet(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    return await client.get(key);
  } catch (err) {
    logger.warn("Redis GET failed", { key, error: (err as Error).message });
    return null;
  }
}

/** Set a key with optional TTL in seconds */
export async function redisSet(
  key: string,
  value: string,
  ttlSecs?: number,
): Promise<void> {
  if (!client) return;
  try {
    if (ttlSecs) await client.set(key, value, { EX: ttlSecs });
    else await client.set(key, value);
  } catch (err) {
    logger.warn("Redis SET failed", { key, error: (err as Error).message });
  }
}

/** Delete a key — used for token blacklist cleanup */
export async function redisDel(key: string): Promise<void> {
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    logger.warn("Redis DEL failed", { key, error: (err as Error).message });
  }
}
