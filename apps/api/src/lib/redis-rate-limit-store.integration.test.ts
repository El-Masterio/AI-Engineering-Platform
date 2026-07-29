import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { Redis } from "ioredis";
import { createRedisRateLimitStore } from "./redis-rate-limit-store.js";
import { decide } from "./rate-limit.js";

/**
 * The Redis store, against a real Redis.
 *
 * The memory store's tests prove the SEMANTICS; this proves the Lua script,
 * which is where the semantics actually live in production. The property that
 * cannot be checked in memory is atomicity under concurrency — a pipeline
 * would pass every sequential test and still let two simultaneous requests both
 * observe a count below the limit.
 */

let container: StartedTestContainer;
let redis: Redis;
let store: ReturnType<typeof createRedisRateLimitStore>;

beforeAll(async () => {
  container = await new GenericContainer("redis:8-alpine").withExposedPorts(6379).start();
  redis = new Redis({ host: container.getHost(), port: container.getMappedPort(6379) });
  store = createRedisRateLimitStore(redis);
}, 180_000);

afterAll(async () => {
  await redis?.quit();
  await container?.stop();
}, 60_000);

describe("the sliding window in Redis", () => {
  it("counts hits", async () => {
    const key = `t:${crypto.randomUUID()}`;
    for (let i = 1; i <= 3; i++) {
      const state = await store.hit(key, 60_000, 10);
      expect(state.count).toBe(i);
    }
  });

  it("counts CONCURRENT hits exactly once each", async () => {
    // The reason the script is Lua and not a pipeline. A pipeline batches round
    // trips without making them atomic, so two requests can interleave between
    // the trim and the count and both see room.
    const key = `t:${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 50 }, () => store.hit(key, 60_000, 100)),
    );

    const counts = results.map((r) => r.count).toSorted((a, b) => a - b);
    expect(counts, "concurrent hits were lost or double-counted").toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it("does not lose two hits landing in the same millisecond", async () => {
    // Unique member per hit: identical score AND member would make ZADD
    // overwrite rather than add, under-counting exactly when load is highest.
    const key = `t:${crypto.randomUUID()}`;
    const [a, b] = await Promise.all([store.hit(key, 60_000, 10), store.hit(key, 60_000, 10)]);
    expect(Math.max(a.count, b.count)).toBe(2);
  });

  it("slides — hits age out of the window", async () => {
    const key = `t:${crypto.randomUUID()}`;
    await store.hit(key, 100, 10);
    await store.hit(key, 100, 10);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const after = await store.hit(key, 100, 10);
    expect(after.count, "aged-out hits were still counted").toBe(1);
  });

  it("reports a reset based on the OLDEST hit", async () => {
    const key = `t:${crypto.randomUUID()}`;
    const first = await store.hit(key, 10_000, 10);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await store.hit(key, 10_000, 10);

    expect(second.resetAt).toBe(first.resetAt);
  });

  it("keeps windows separate per key, so limits stay per-tenant", async () => {
    const a = `t:${crypto.randomUUID()}`;
    const b = `t:${crypto.randomUUID()}`;
    await store.hit(a, 60_000, 10);
    await store.hit(a, 60_000, 10);

    const other = await store.hit(b, 60_000, 10);
    expect(other.count, "one tenant's traffic counted against another's").toBe(1);
  });

  it("expires an idle window without a sweeper", async () => {
    const key = `t:${crypto.randomUUID()}`;
    await store.hit(key, 200, 10);

    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(200);
  });

  it("drives the same decision the memory store would", async () => {
    const key = `t:${crypto.randomUUID()}`;
    let last = await store.hit(key, 60_000, 3);
    for (let i = 0; i < 3; i++) last = await store.hit(key, 60_000, 3);

    expect(decide(last, 3).allowed).toBe(false);
    expect(decide(last, 3).remaining).toBe(0);
  });
});
