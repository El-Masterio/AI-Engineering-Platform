import type { Redis } from "ioredis";
import type { RateLimitStore } from "./rate-limit.js";

/**
 * The sliding window, in Redis (§16).
 *
 * A sorted set per key: members are hit ids, scores are timestamps. Trimming by
 * score is what makes the window slide, and `ZCARD` after the trim is the count.
 *
 * Executed as a **Lua script**, not a pipeline. A pipeline batches round trips
 * but does not make them atomic — two concurrent requests can interleave
 * between the trim and the count, and both observe a count below the limit.
 * Redis runs a script to completion without interleaving, which is the only
 * property that makes the number trustworthy.
 */

/**
 * KEYS[1] window
 * ARGV[1] now (ms)  ARGV[2] windowMs  ARGV[3] unique member id
 * → { count, oldestScore }
 */
const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]

-- Drop everything that has fallen out of the window.
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
redis.call('ZADD', key, now, member)

-- Expire the whole key once the last hit would have aged out, so an idle
-- caller's window is reclaimed without a sweeper.
redis.call('PEXPIRE', key, window)

local count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
return { count, oldest[2] or tostring(now) }
`;

export function createRedisRateLimitStore(redis: Redis): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const now = Date.now();
      // A unique member per hit: two requests in the same millisecond would
      // otherwise collide on score AND member, and ZADD would overwrite rather
      // than add — silently under-counting exactly when load is highest.
      const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

      const [count, oldest] = (await redis.eval(
        SLIDING_WINDOW,
        1,
        key,
        String(now),
        String(windowMs),
        member,
      )) as [number, string];

      return {
        count,
        // The window frees when its OLDEST hit ages out.
        resetAt: Number(oldest) + windowMs,
      };
    },
    async reset(key) {
      await redis.del(key);
    },
  };
}
