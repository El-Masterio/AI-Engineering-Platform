import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashRequest, sweepIdempotencyKeys, withIdempotency } from "./idempotency.js";
import { provisionPersonalOrganization } from "./tenancy.js";
import { createTenantContext, type TenantContext } from "./tenant-context.js";
import { startHarness, type Harness } from "./testing/harness.js";

/**
 * §16: "an agent run started twice costs twice". These tests are about money,
 * so the one that matters most is not "a replay returns the stored response" —
 * it is that the work runs EXACTLY ONCE, asserted by counting side effects
 * rather than by inspecting what came back.
 */

let h: Harness;
let context: TenantContext;
let other: TenantContext;

beforeAll(async () => {
  h = await startHarness();

  const mk = async (email: string): Promise<TenantContext> => {
    const userId = crypto.randomUUID();
    await h.owner`INSERT INTO users (id, email) VALUES (${userId}, ${email})`;
    const org = await provisionPersonalOrganization(h.appDb, { userId, email });
    return createTenantContext(org.organizationId);
  };

  context = await mk("idem@example.test");
  other = await mk("idem-other@example.test");
}, 180_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

describe("withIdempotency", () => {
  it("runs the work once and reports it fresh", async () => {
    let calls = 0;
    const outcome = await withIdempotency(
      h.appDb,
      context,
      { key: "k1", route: "/runs", body: { a: 1 } },
      () => {
        calls++;
        return Promise.resolve({ status: 201, body: { id: "run-1" } });
      },
    );

    expect(outcome.kind).toBe("fresh");
    expect(calls).toBe(1);
  });

  it("does NOT run the work again on replay", async () => {
    // The assertion that matters. Counting the side effect, not the response.
    let calls = 0;
    const outcome = await withIdempotency(
      h.appDb,
      context,
      { key: "k1", route: "/runs", body: { a: 1 } },
      () => {
        calls++;
        return Promise.resolve({ status: 201, body: { id: "run-DIFFERENT" } });
      },
    );

    expect(calls, "the work ran a second time — this is the double-charge bug").toBe(0);
    expect(outcome.kind).toBe("replay");
    expect(outcome.kind === "replay" ? outcome.body : undefined).toEqual({ id: "run-1" });
    expect(outcome.kind === "replay" ? outcome.status : undefined).toBe(201);
  });

  it("REFUSES a reused key carrying different content", async () => {
    // Answering this with the stored response would tell the caller their new
    // operation succeeded when it never ran.
    let calls = 0;
    const outcome = await withIdempotency(
      h.appDb,
      context,
      { key: "k1", route: "/runs", body: { a: 999 } },
      () => {
        calls++;
        return Promise.resolve({ status: 201, body: { id: "nope" } });
      },
    );

    expect(outcome.kind).toBe("conflict");
    expect(calls).toBe(0);
  });

  it("treats the same key on a DIFFERENT route as a different operation", async () => {
    const outcome = await withIdempotency(
      h.appDb,
      context,
      { key: "k1", route: "/plans", body: { a: 1 } },
      () => Promise.resolve({ status: 200, body: { id: "plan-1" } }),
    );
    expect(outcome.kind).toBe("fresh");
  });

  it("scopes keys per TENANT, so two tenants may choose the same one", async () => {
    // A key is client-chosen; two tenants will eventually pick the same string.
    // Without the scope, tenant B's request is answered with tenant A's result.
    const outcome = await withIdempotency(
      h.appDb,
      other,
      { key: "k1", route: "/runs", body: { a: 1 } },
      () => Promise.resolve({ status: 201, body: { id: "other-tenant-run" } }),
    );

    expect(outcome.kind).toBe("fresh");
    expect(outcome.kind === "fresh" ? outcome.body : undefined).toEqual({
      id: "other-tenant-run",
    });
  });

  it("does not record a reservation when the work throws", async () => {
    // The reservation and the work share a transaction, so a failure rolls both
    // back and a retry gets a clean attempt rather than a permanent conflict.
    await expect(
      withIdempotency(h.appDb, context, { key: "k-fails", route: "/runs", body: {} }, () =>
        Promise.reject(new Error("the work failed")),
      ),
    ).rejects.toThrow("the work failed");

    let calls = 0;
    const retry = await withIdempotency(
      h.appDb,
      context,
      { key: "k-fails", route: "/runs", body: {} },
      () => {
        calls++;
        return Promise.resolve({ status: 201, body: { ok: true } });
      },
    );

    expect(retry.kind, "a failed attempt permanently burned the key").toBe("fresh");
    expect(calls).toBe(1);
  });

  it("reports an in-flight duplicate rather than running concurrently", async () => {
    // Two simultaneous retries: the unique index serialises them.
    // Held open by hand so the duplicate arrives while the first is still
    // running — which is the only way to reach the in-flight branch.
    const { promise: held, resolve: release } = Promise.withResolvers<void>();

    const first = withIdempotency(
      h.appDb,
      context,
      { key: "k-race", route: "/runs", body: {} },
      async () => {
        await held;
        return { status: 201, body: { id: "winner" } };
      },
    );

    // Give the reservation time to land before the duplicate arrives.
    await new Promise((resolve) => setTimeout(resolve, 150));

    let secondCalls = 0;
    const second = await withIdempotency(
      h.appDb,
      context,
      { key: "k-race", route: "/runs", body: {} },
      () => {
        secondCalls++;
        return Promise.resolve({ status: 201, body: { id: "loser" } });
      },
    );

    expect(second.kind).toBe("in_flight");
    expect(secondCalls, "both duplicates ran the work").toBe(0);

    release();
    const firstOutcome = await first;
    expect(firstOutcome.kind).toBe("fresh");
  });
});

describe("hashRequest", () => {
  it("is stable for equal bodies and different for unequal ones", () => {
    expect(hashRequest({ a: 1 })).toBe(hashRequest({ a: 1 }));
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
  });

  it("handles an absent body", () => {
    expect(hashRequest(undefined)).toBe(hashRequest(null));
  });
});

describe("sweepIdempotencyKeys", () => {
  it("deletes only expired records", async () => {
    await withIdempotency(h.appDb, context, { key: "k-live", route: "/runs", body: {} }, () =>
      Promise.resolve({ status: 200, body: {} }),
    );
    await h.owner`
      UPDATE idempotency_keys SET expires_at = now() - interval '1 hour' WHERE key = 'k1'
    `;

    const deleted = await sweepIdempotencyKeys(h.appDb, context);
    expect(deleted).toBeGreaterThan(0);

    const [live] = await h.owner<{ count: string }[]>`
      SELECT count(*)::text FROM idempotency_keys WHERE key = 'k-live'
    `;
    expect(live?.count, "a live record was swept").toBe("1");
  });
});
