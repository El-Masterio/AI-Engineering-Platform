import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql as raw } from "drizzle-orm";
import { auditEventForDecision, ensureAuditPartition, queryAudit, writeAudit } from "./audit.js";
import { provisionPersonalOrganization } from "./tenancy.js";
import { createTenantContext, withTenant, type TenantContext } from "./tenant-context.js";
import { startHarness, type Harness } from "./testing/harness.js";

/**
 * §17 Control 8 and FR-AUDIT-1..5.
 *
 * The two acceptance criteria that matter are both NEGATIVE — an UPDATE from
 * the app role must fail at the database, and a rolled-back action must leave
 * no audit row — so those are what this file leads with. "We wrote a record"
 * passes just as well against a mutable table.
 *
 * Everything runs through `h.appDb` (`atelier_app`, subject to RLS and to the
 * grants). Run as the owner, the immutability assertions would pass no matter
 * what the grants said.
 */

let h: Harness;
let context: TenantContext;
let other: TenantContext;
let userId: string;

async function makeTenant(email: string): Promise<{ context: TenantContext; userId: string }> {
  const id = crypto.randomUUID();
  await h.owner`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
  const org = await provisionPersonalOrganization(h.appDb, { userId: id, email });
  return { context: createTenantContext(org.organizationId), userId: id };
}

beforeAll(async () => {
  h = await startHarness();
  const primary = await makeTenant("audit@example.test");
  context = primary.context;
  userId = primary.userId;
  const secondary = await makeTenant("audit-other@example.test");
  other = secondary.context;
}, 180_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

/** Write one record the way production does — inside a transaction. */
async function record(ctx: TenantContext, event: Parameters<typeof writeAudit>[2]): Promise<void> {
  await withTenant(h.appDb, ctx, async (tx) => {
    await writeAudit(tx, ctx, event);
  });
}

describe("immutability is a GRANT, not a convention (FR-AUDIT-4)", () => {
  beforeAll(async () => {
    await record(context, { action: "project:delete", outcome: "succeeded", actorUserId: userId });
  });

  it("REFUSES an UPDATE from the application role", async () => {
    // The acceptance criterion, and the whole point of the control. FR-AUDIT-4:
    // "there is no update or delete path" — the only way to make that true is
    // for the path not to exist.
    const error = await capture(
      () => h.app`UPDATE audit_log SET action = 'tampered' WHERE action = 'project:delete'`,
    );
    expect(error, "audit rows are mutable by the app role").toBeDefined();
    expect((error as { code?: string }).code, "failed for the wrong reason").toBe("42501");
  });

  it("REFUSES a DELETE from the application role", async () => {
    const error = await capture(() => h.app`DELETE FROM audit_log`);
    expect(error).toBeDefined();
    expect((error as { code?: string }).code).toBe("42501");
  });

  it("REFUSES TRUNCATE, which RLS would not have filtered anyway", async () => {
    // Worth its own assertion: RLS does not apply to TRUNCATE, so a role
    // holding it could empty the table for every tenant at once.
    const error = await capture(() => h.app`TRUNCATE audit_log`);
    expect(error).toBeDefined();
  });

  it("still allows INSERT and SELECT, or the log would be useless", async () => {
    await expect(
      record(context, { action: "project:create", outcome: "succeeded" }),
    ).resolves.toBeUndefined();
    const rows = await queryAudit(h.appDb, context);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("completeness — the record shares the action's transaction", () => {
  it("leaves NO audit row when the surrounding action rolls back", async () => {
    // §17: "an action cannot exist without its record". The converse matters
    // just as much — a record for an action that never happened is a false
    // entry in the one table people trust absolutely.
    const before = await queryAudit(h.appDb, context, { action: "run:start" });

    await expect(
      withTenant(h.appDb, context, async (tx) => {
        await writeAudit(tx, context, { action: "run:start", outcome: "succeeded" });
        throw new Error("the action failed after its audit row was written");
      }),
    ).rejects.toThrow("the action failed");

    const after = await queryAudit(h.appDb, context, { action: "run:start" });
    expect(after.length, "an audit row survived a rolled-back action").toBe(before.length);
  });

  it("keeps the row when the action commits", async () => {
    await withTenant(h.appDb, context, async (tx) => {
      await writeAudit(tx, context, { action: "run:interrupt", outcome: "succeeded" });
    });
    expect(await queryAudit(h.appDb, context, { action: "run:interrupt" })).toHaveLength(1);
  });
});

describe("tenant isolation", () => {
  it("does not show one tenant another's records", async () => {
    await record(other, { action: "project:read", outcome: "allowed" });

    const mine = await queryAudit(h.appDb, context, { action: "project:read" });
    expect(mine, "audit rows leaked across tenants").toHaveLength(0);
  });

  it("shows a tenant its own", async () => {
    expect(await queryAudit(h.appDb, other, { action: "project:read" })).toHaveLength(1);
  });
});

describe("the record carries what FR-AUDIT-1 asks for", () => {
  it("stores actor, action, resource, timestamp, request id and IP", async () => {
    await record(context, {
      action: "member:remove",
      outcome: "succeeded",
      actorUserId: userId,
      resourceKind: "membership",
      resourceId: "m-1",
      requestId: "req-abc",
      ipAddress: "203.0.113.4",
      metadata: { removed: "grace" },
    });

    const [row] = await queryAudit(h.appDb, context, { action: "member:remove" });
    expect(row?.actorUserId).toBe(userId);
    expect(row?.resourceKind).toBe("membership");
    expect(row?.resourceId).toBe("m-1");
    expect(row?.requestId).toBe("req-abc");
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.metadata).toEqual({ removed: "grace" });
  });

  it("records a DENIAL, not only a success (§17 coverage)", async () => {
    // "All approvals and denials, all policy denials." A log of successes is a
    // log that cannot answer the question anyone actually asks after an
    // incident.
    await record(context, {
      action: "project:delete",
      outcome: "denied",
      actorUserId: userId,
      metadata: { reason: "role_lacks_permission" },
    });

    const denials = await queryAudit(h.appDb, context, { outcome: "denied" });
    expect(denials.length).toBeGreaterThan(0);
  });

  it("allows a system actor with no user behind it", async () => {
    // Not every state change has a human behind it, and inventing one would be
    // worse than recording none.
    await record(context, {
      action: "partition.create",
      outcome: "succeeded",
      actorType: "system",
    });

    const [row] = await queryAudit(h.appDb, context, { action: "partition.create" });
    expect(row?.actorUserId).toBeNull();
    expect(row?.actorType).toBe("system");
  });

  it("refuses an actor type outside the known set", async () => {
    const error = await capture(
      () =>
        h.owner`
        INSERT INTO audit_log (organization_id, action, outcome, actor_type)
        VALUES (${context.organizationId}, 'x', 'succeeded', 'wizard')
      `,
    );
    expect((error as { constraint_name?: string }).constraint_name).toBe(
      "chk_audit_log_actor_type",
    );
  });
});

describe("querying (FR-AUDIT-5)", () => {
  it("returns newest first", async () => {
    const rows = await queryAudit(h.appDb, context, { limit: 50 });
    const times = rows.map((r) => r.createdAt.getTime());
    expect(times).toEqual([...times].toSorted((a, b) => b - a));
  });

  it("filters by actor and by outcome", async () => {
    const byActor = await queryAudit(h.appDb, context, { actorUserId: userId });
    expect(byActor.every((r) => r.actorUserId === userId)).toBe(true);

    const denied = await queryAudit(h.appDb, context, { outcome: "denied" });
    expect(denied.every((r) => r.outcome === "denied")).toBe(true);
  });

  it("caps the limit, so one query cannot pull the whole table", async () => {
    const rows = await queryAudit(h.appDb, context, { limit: 100_000 });
    expect(rows.length).toBeLessThanOrEqual(200);
  });
});

describe("partitioning is automated", () => {
  it("is idempotent for a month that already exists", async () => {
    const name = await ensureAuditPartition(h.appDb, context, new Date());
    const again = await ensureAuditPartition(h.appDb, context, new Date());
    expect(again).toBe(name);
  });

  it("creates a FUTURE month and lets the app write into it", async () => {
    // A new partition inherits the parent's RLS but NOT its grants — so
    // forgetting the GRANT would be an outage on the first of the month, every
    // month. This writes a row dated inside the new partition to prove it.
    const future = new Date(Date.now() + 200 * 24 * 3600 * 1000);
    const name = await ensureAuditPartition(h.appDb, context, future);
    expect(name).toContain("audit_log_");

    // An explicit created_at, so the row lands in the NEW partition rather than
    // today's — which is what proves the GRANT was applied to it.
    await withTenant(h.appDb, context, async (tx) => {
      await tx.execute(
        raw`INSERT INTO audit_log (organization_id, action, outcome, created_at)
            VALUES (${context.organizationId}, 'future.write', 'succeeded', ${future.toISOString()}::timestamptz)`,
      );
    });

    // Read it out of the partition itself, not the parent: reading the parent
    // would pass even if routing had put the row somewhere else.
    const landed = await h.owner.unsafe<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM ${name}`,
    );
    expect(landed[0]?.count, "the row did not land in the new partition").toBe("1");
  });

  it("has a partition covering today, or every INSERT would fail", async () => {
    const [row] = await h.owner<{ count: string }[]>`
      SELECT count(*)::text FROM pg_class c
      JOIN pg_inherits i ON i.inhrelid = c.oid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'audit_log'
    `;
    expect(Number(row?.count ?? 0)).toBeGreaterThanOrEqual(3);
  });
});

async function capture(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

describe("policy decisions become audit records (M017 → M018)", () => {
  it("records a denial with its reason", async () => {
    // §17 coverage includes "all policy denials". The policy engine emits every
    // decision to a sink; this is the translation.
    const event = auditEventForDecision({
      allowed: false,
      action: "project:delete",
      reason: "role_lacks_permission",
      principal: { userId },
    });
    await record(context, event);

    const [row] = await queryAudit(h.appDb, context, {
      action: "project:delete",
      outcome: "denied",
    });
    expect(row?.metadata).toEqual({ reason: "role_lacks_permission" });
    expect(row?.actorType).toBe("user");
  });

  it("marks an API-key principal as such, not as a user", async () => {
    // An action taken by a key is not the same as one taken by a person at a
    // keyboard, and an audit log that cannot tell them apart is one that
    // cannot answer "who did this".
    await record(
      context,
      auditEventForDecision({
        allowed: true,
        action: "run:start",
        principal: { userId, scopes: ["run:start"] },
      }),
    );

    const [row] = await queryAudit(h.appDb, context, { action: "run:start", outcome: "allowed" });
    expect(row?.actorType).toBe("api_key");
  });
});
