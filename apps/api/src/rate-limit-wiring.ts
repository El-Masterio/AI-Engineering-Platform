// Named import, not default: under NodeNext the CJS default is the module
// namespace, which has no construct signature.
import { Redis } from "ioredis";
import type { Env } from "@atelier/config";
import type { Logger } from "@atelier/observability";
import { createMemoryStore, type RateLimitStore } from "./lib/rate-limit.js";
import { createRedisRateLimitStore } from "./lib/redis-rate-limit-store.js";

/**
 * Choose where rate-limit windows live.
 *
 * The in-memory store is correct for one replica and **wrong for several** —
 * each process counts separately, so N replicas enforce N times the limit. The
 * failure is silent: every replica looks perfectly correct on its own.
 *
 * So the warning below is not decoration. Staging runs a single replica today
 * (ADR-009), and the moment that changes without `REDIS_URL` the control
 * quietly stops being one.
 */
export type RateLimitWiring = { store: RateLimitStore; close: () => Promise<void> };

export function createRateLimitStore(env: Env, logger: Logger): RateLimitWiring {
  if (env.REDIS_URL === undefined) {
    if (env.NODE_ENV === "production") {
      logger.warn(
        "REDIS_URL is not set; rate-limit windows are per-process. Correct for one replica, " +
          "and N replicas will enforce N times the limit.",
      );
    }
    return { store: createMemoryStore(), close: () => Promise.resolve() };
  }

  const redis = new Redis(env.REDIS_URL, {
    // Fail fast rather than queueing: the limiter fails OPEN on error, so a
    // slow retry loop would hold requests instead of letting them through.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  redis.on("error", (error: unknown) => {
    logger.warn({ err: error }, "redis connection error");
  });

  return {
    store: createRedisRateLimitStore(redis),
    close: async () => {
      await redis.quit();
    },
  };
}
