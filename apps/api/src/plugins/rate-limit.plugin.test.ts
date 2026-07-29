// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import {
  RATE_LIMITS,
  createMemoryStore,
  decide,
  rateLimitKey,
  tierFor,
} from "../lib/rate-limit.js";

/**
 * M020 acceptance: limits enforced per §16 · headers present · 429 includes
 * Retry-After · limits are per-tenant, not global.
 *
 * The last one is the assertion worth having. A limiter that works but shares
 * one window across customers is a denial-of-service any customer can trigger
 * by accident, and it looks completely correct from a single client.
 */

const noop = (): void => {
  /* not what these tests are about */
};
const logger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  fatal: noop,
  trace: noop,
  child: noop,
} as never;

async function serverWith(store = createMemoryStore()): Promise<FastifyInstance> {
  const app = await buildServer({ port: 0, logger, rateLimitStore: store });
  app.get("/thing", () => ({ ok: true }));
  app.post("/thing", () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("headers are on EVERY response, not only the rejection", () => {
  it("advertises the limit, what is left, and when it resets", async () => {
    // A client that can see it has 4 left can slow down; one that only learns
    // at rejection can only retry, which turns a busy client into a storm.
    const app = await serverWith();
    const response = await app.inject({ method: "GET", url: "/thing" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["ratelimit-limit"]).toBe(String(RATE_LIMITS.anonymous.limit));
    expect(response.headers["ratelimit-remaining"]).toBe(String(RATE_LIMITS.anonymous.limit - 1));
    expect(Number(response.headers["ratelimit-reset"])).toBeGreaterThan(0);
  });

  it("counts down as requests are made", async () => {
    const app = await serverWith();
    const first = await app.inject({ method: "GET", url: "/thing" });
    const second = await app.inject({ method: "GET", url: "/thing" });

    expect(Number(second.headers["ratelimit-remaining"])).toBe(
      Number(first.headers["ratelimit-remaining"]) - 1,
    );
  });
});

describe("the limit is enforced", () => {
  it("returns 429 with Retry-After once the window is full", async () => {
    const app = await serverWith();
    const limit = RATE_LIMITS.anonymous.limit;

    let last = await app.inject({ method: "GET", url: "/thing" });
    for (let i = 1; i <= limit; i++) {
      last = await app.inject({ method: "GET", url: "/thing" });
    }

    expect(last.statusCode).toBe(429);
    expect(Number(last.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("rejects in the §16 envelope, like every other error", async () => {
    const app = await serverWith();
    for (let i = 0; i <= RATE_LIMITS.anonymous.limit; i++) {
      await app.inject({ method: "GET", url: "/thing" });
    }
    const response = await app.inject({ method: "GET", url: "/thing" });

    const body = JSON.parse(response.body) as { error: { type: string; request_id: string } };
    expect(body.error.type).toBe("rate_limited");
    expect(body.error.request_id).toBeTruthy();
  });

  it("allows exactly the advertised number before refusing", async () => {
    // Off by one here means the advertised limit is a lie in one direction or
    // the other, and clients calibrate against the header.
    const app = await serverWith();
    const limit = RATE_LIMITS.anonymous.limit;

    const statuses: number[] = [];
    for (let i = 0; i < limit + 1; i++) {
      const response = await app.inject({ method: "GET", url: "/thing" });
      statuses.push(response.statusCode);
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(limit);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("probes are never limited", () => {
  it("keeps answering /readyz past the limit", async () => {
    // An orchestrator polls readiness far more often than any user polls
    // anything. Limiting it means the container is killed for being healthy.
    const app = await serverWith();
    for (let i = 0; i <= RATE_LIMITS.anonymous.limit + 5; i++) {
      await app.inject({ method: "GET", url: "/readyz" });
    }

    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["ratelimit-limit"], "a probe was rate limited").toBeUndefined();
  });
});

describe("limits are PER-TENANT, not global", () => {
  it("keeps a separate window per organization", () => {
    // The acceptance criterion. A shared window lets one busy customer exhaust
    // everyone else's allowance, and it looks correct from a single client.
    const a = rateLimitKey({ tier: "apiKeyRead", organizationId: "org-a", apiKeyId: "k1" });
    const b = rateLimitKey({ tier: "apiKeyRead", organizationId: "org-b", apiKeyId: "k2" });
    expect(a).not.toBe(b);
  });

  it("keeps a separate window per API key within one organization", () => {
    const a = rateLimitKey({ tier: "apiKeyRead", organizationId: "org-a", apiKeyId: "k1" });
    const b = rateLimitKey({ tier: "apiKeyRead", organizationId: "org-a", apiKeyId: "k2" });
    expect(a).not.toBe(b);
  });

  it("separates reads from writes, per §16's two allowances", () => {
    expect(tierFor("GET", true)).toBe("apiKeyRead");
    expect(tierFor("POST", true)).toBe("apiKeyWrite");
    expect(tierFor("DELETE", true)).toBe("apiKeyWrite");
    expect(rateLimitKey({ tier: "apiKeyRead", apiKeyId: "k" })).not.toBe(
      rateLimitKey({ tier: "apiKeyWrite", apiKeyId: "k" }),
    );
  });

  it("treats an unauthenticated caller as anonymous, keyed by IP", () => {
    expect(tierFor("GET", false)).toBe("anonymous");
    expect(tierFor("POST", false)).toBe("anonymous");
  });

  it("gives writes a smaller allowance than reads (§16)", () => {
    expect(RATE_LIMITS.apiKeyWrite.limit).toBeLessThan(RATE_LIMITS.apiKeyRead.limit);
  });
});

describe("failing open", () => {
  it("allows the request when the store is broken, rather than 500ing", async () => {
    // Rejecting everything would turn a Redis blip into a total outage. The
    // limiter protects against abuse, and abuse during an outage is the
    // smaller problem — but the warning is what stops this being a silent
    // loss of the control.
    const broken = {
      hit: () => Promise.reject(new Error("redis is gone")),
    };
    const app = await buildServer({ port: 0, logger, rateLimitStore: broken });
    app.get("/thing", () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/thing" });
    expect(response.statusCode).toBe(200);
    expect(
      response.headers["ratelimit-limit"],
      "headers were sent from a failed check",
    ).toBeUndefined();
  });
});

describe("the window SLIDES rather than resetting on a boundary", () => {
  let store: ReturnType<typeof createMemoryStore>;

  beforeEach(() => {
    store = createMemoryStore();
  });

  it("drops hits that have aged out", async () => {
    // A fixed window lets a caller send the full limit at 11:59:59 and again at
    // 12:00:00 — twice the ceiling in one second, which is the burst the limit
    // exists to prevent.
    const windowMs = 60;
    for (let i = 0; i < 5; i++) await store.hit("k", windowMs, 10);

    const full = await store.hit("k", windowMs, 10);
    expect(full.count).toBe(6);

    await new Promise((resolve) => setTimeout(resolve, windowMs + 20));

    const afterAging = await store.hit("k", windowMs, 10);
    expect(afterAging.count, "old hits were not dropped").toBe(1);
  });

  it("resets when the OLDEST hit ages out, not a full window from now", async () => {
    // Otherwise Retry-After tells a caller to wait far longer than they must.
    const windowMs = 10_000;
    const first = await store.hit("k", windowMs, 10);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await store.hit("k", windowMs, 10);

    expect(second.resetAt).toBe(first.resetAt);
  });
});

describe("decide", () => {
  it("allows the hit that reaches the limit exactly", () => {
    expect(decide({ count: 10, resetAt: Date.now() + 1000 }, 10).allowed).toBe(true);
    expect(decide({ count: 11, resetAt: Date.now() + 1000 }, 10).allowed).toBe(false);
  });

  it("never reports negative remaining", () => {
    expect(decide({ count: 50, resetAt: Date.now() + 1000 }, 10).remaining).toBe(0);
  });

  it("never reports a Retry-After below one second", () => {
    // A zero would invite an immediate retry, which is refused again.
    expect(decide({ count: 11, resetAt: Date.now() - 5000 }, 10).retryAfter).toBeGreaterThanOrEqual(
      1,
    );
  });
});
