import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql as raw } from "drizzle-orm";
import { provisionPersonalOrganization } from "./tenancy.js";
import { createTenantContext, withTenant, type TenantContext } from "./tenant-context.js";
import {
  NON_TENANT_TABLES,
  discoverTables,
  tenantScopedTables,
  unaccountedTables,
  type TenantScopedTable,
} from "./testing/tenant-scoped-tables.js";
import { startHarness, type Harness } from "./testing/harness.js";

/**
 * The most important test suite in the codebase (M021), and the one most at
 * risk of quietly meaning less than it appears to.
 *
 * Every case here is GENERATED from what Postgres actually contains. A
 * hand-written list of tables stops being complete the moment someone adds a
 * table, and it fails in the worst possible direction — the suite still passes,
 * still looks thorough, and no longer covers what was just introduced.
 *
 * Everything runs as `atelier_app`. The M004 harness asserts that role is not a
 * superuser, because a superuser bypasses RLS unconditionally and every
 * assertion below would pass no matter how broken the policies were.
 */

let h: Harness;
let tables: readonly TenantScopedTable[];
let scoped: readonly TenantScopedTable[];
let alice: TenantContext;
let bob: TenantContext;
let aliceUserId: string;

async function makeTenant(email: string): Promise<{ context: TenantContext; userId: string }> {
  const id = crypto.randomUUID();
  await h.owner`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
  const org = await provisionPersonalOrganization(h.appDb, { userId: id, email });
  return { context: createTenantContext(org.organizationId), userId: id };
}

beforeAll(async () => {
  h = await startHarness();
  tables = await discoverTables(h.owner);
  scoped = tenantScopedTables(tables);

  const a = await makeTenant("alice@example.test");
  const b = await makeTenant("bob@example.test");
  alice = a.context;
  aliceUserId = a.userId;
  bob = b.context;

  // One row per scoped table, owned by ALICE, written as the owner so RLS does
  // not interfere with fixture setup.
  await h.owner`
    INSERT INTO idempotency_keys (id, organization_id, key, route, request_hash, expires_at)
    VALUES (gen_random_uuid(), ${alice.organizationId}, 'k', '/r', 'h', now() + interval '1 day')
  `;
  await h.owner`
    INSERT INTO audit_log (organization_id, action, outcome)
    VALUES (${alice.organizationId}, 'test.event', 'succeeded')
  `;
  await h.owner`
    INSERT INTO api_keys (id, organization_id, created_by, prefix, key_hash, name)
    VALUES (gen_random_uuid(), ${alice.organizationId}, ${aliceUserId}, 'atl_x', 'hash-x', 'k')
  `;
  await h.owner`
    INSERT INTO agent_definitions (organization_id, agent_id, version, origin, spec)
    VALUES (${alice.organizationId}, 'cross-tenant-probe', 1, 'platform', '{}'::jsonb)
  `;
}, 240_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

describe("the suite covers everything, and knows when it does not", () => {
  it("found tenant-scoped tables to test", () => {
    // A generator that discovers nothing passes every case below vacuously.
    expect(scoped.length, "no tenant-scoped tables were discovered").toBeGreaterThan(0);
  });

  it("has NO table that is neither tenant-scoped nor explained", () => {
    // The acceptance criterion: adding a table without a policy fails the suite.
    // A new table either scopes itself by organization_id, or someone writes
    // down why it does not. There is no third option that passes.
    const orphans = unaccountedTables(tables);
    expect(
      orphans,
      `table(s) with no organization_id and no entry in NON_TENANT_TABLES: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps a reason for every exemption", () => {
    for (const [table, reason] of Object.entries(NON_TENANT_TABLES)) {
      expect(reason.length, `${table} is exempt with no reason`).toBeGreaterThan(20);
    }
  });

  it("does not exempt a table that no longer exists", () => {
    // A stale exemption is how a real table later slips through under a name
    // someone once excused.
    const existing = new Set(tables.map((t) => t.name));
    for (const table of Object.keys(NON_TENANT_TABLES)) {
      expect(existing.has(table), `${table} is exempt but does not exist`).toBe(true);
    }
  });
});

describe("row-level security is ON and FORCED for every scoped table", () => {
  it("enables RLS", () => {
    const missing = scoped.filter((t) => !t.rlsEnabled).map((t) => t.name);
    expect(missing, `RLS is not enabled on: ${missing.join(", ")}`).toEqual([]);
  });

  it("FORCES it", () => {
    // Without FORCE the table owner bypasses every policy, and the application
    // connects as the owner often enough that the control looks present and
    // does nothing (ADR-003).
    const missing = scoped.filter((t) => !t.rlsForced).map((t) => t.name);
    expect(missing, `RLS is not FORCED on: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries at least one policy", () => {
    // RLS enabled with no policy denies everything, which is safe and looks
    // exactly like a broken feature.
    const missing = scoped.filter((t) => t.policies.length === 0).map((t) => t.name);
    expect(missing, `no policy on: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("reading another tenant's rows", () => {
  it("returns ZERO rows for every scoped table", async () => {
    // The core assertion, generated. Empty rather than denied: RLS filters, so
    // the accident is an empty result and never a cross-tenant one.
    for (const table of scoped) {
      if (!table.grants.includes("SELECT")) continue;

      const rows = await withTenant(h.appDb, bob, async (tx) =>
        tx.execute(
          raw`SELECT count(*)::int AS count FROM ${raw.raw(table.name)}
              WHERE ${raw.raw(table.tenantColumn)} = ${alice.organizationId}`,
        ),
      );

      const count = (rows as unknown as { count: number }[])[0]?.count ?? -1;
      expect(count, `${table.name} leaked rows to another tenant`).toBe(0);
    }
  });

  it("returns Alice's rows to Alice, so the check above is not vacuous", async () => {
    // Without this, a suite that returned nothing to ANYONE would pass the
    // isolation test perfectly while the product was completely broken.
    let found = 0;
    for (const table of scoped) {
      if (!table.grants.includes("SELECT")) continue;

      const rows = await withTenant(h.appDb, alice, async (tx) =>
        tx.execute(
          raw`SELECT count(*)::int AS count FROM ${raw.raw(table.name)}
              WHERE ${raw.raw(table.tenantColumn)} = ${alice.organizationId}`,
        ),
      );
      found += (rows as unknown as { count: number }[])[0]?.count ?? 0;
    }

    expect(found, "no tenant could see its OWN rows — the suite proves nothing").toBeGreaterThan(0);
  });
});

describe("writing into another tenant", () => {
  it("cannot INSERT a row belonging to someone else", async () => {
    // WITH CHECK is the half people forget: a policy with only USING filters
    // reads and happily accepts a write into another tenant.
    for (const table of scoped) {
      if (!table.grants.includes("INSERT")) continue;

      // Built OUTSIDE the try, and this matters. `insertForeignRow` throws when a
      // table has no fixture, and inside the try that throw was caught by the
      // bare `catch` below and read as "the write was refused" — so a new
      // tenant-scoped table got no INSERT coverage while the suite stayed green.
      // That is precisely the failure mode this file's own comment calls the
      // worst one, sitting inside the check meant to prevent it. Found in M024 by
      // deleting the new table's fixture and watching the suite pass.
      const foreignInsert = insertForeignRow(table, alice.organizationId, aliceUserId);

      let wasRefused = true;
      try {
        await withTenant(h.appDb, bob, async (tx) => {
          await tx.execute(foreignInsert);
          wasRefused = false;
        });
      } catch {
        wasRefused = true;
      }

      expect(wasRefused, `${table.name} accepted a row for another tenant`).toBe(true);
    }
  });

  it("cannot UPDATE another tenant's rows", async () => {
    for (const table of scoped) {
      if (!table.grants.includes("UPDATE")) continue;

      const affected = await withTenant(h.appDb, bob, async (tx) => {
        // Assign the tenant column to itself: a semantic no-op that exists on
        // every scoped table by definition. Naming a real column (`updated_at`)
        // made the generated case depend on a schema detail some tables do not
        // share, and it failed on the first table that lacked it.
        const result = await tx.execute(
          raw`UPDATE ${raw.raw(table.name)}
              SET ${raw.raw(table.tenantColumn)} = ${raw.raw(table.tenantColumn)}
              WHERE ${raw.raw(table.tenantColumn)} = ${alice.organizationId}`,
        );
        return (result as unknown as { count?: number }).count ?? 0;
      });

      expect(affected, `${table.name} allowed an update to another tenant`).toBe(0);
    }
  });

  it("cannot DELETE another tenant's rows", async () => {
    for (const table of scoped) {
      if (!table.grants.includes("DELETE")) continue;

      const affected = await withTenant(h.appDb, bob, async (tx) => {
        const result = await tx.execute(
          raw`DELETE FROM ${raw.raw(table.name)}
              WHERE ${raw.raw(table.tenantColumn)} = ${alice.organizationId}`,
        );
        return (result as unknown as { count?: number }).count ?? 0;
      });

      expect(affected, `${table.name} allowed a delete in another tenant`).toBe(0);
    }
  });

  it("left Alice's rows intact after all of that", async () => {
    // The update and delete cases pass on "0 rows affected". This confirms the
    // rows were actually still there to affect.
    const [row] = await h.owner<{ count: string }[]>`
      SELECT count(*)::text FROM audit_log WHERE organization_id = ${alice.organizationId}
    `;
    expect(Number(row?.count ?? 0)).toBeGreaterThan(0);
  });
});

describe("with NO tenant claim set at all", () => {
  it("shows nothing, rather than everything", async () => {
    // The failure this guards is a query that forgot withTenant(). It must
    // return an empty result, never an unscoped one.
    for (const table of scoped) {
      if (!table.grants.includes("SELECT")) continue;

      const rows = await h.app.unsafe<{ count: string }[]>(
        `SELECT count(*)::text AS count FROM ${table.name}`,
      );
      expect(rows[0]?.count, `${table.name} is readable with no tenant claim`).toBe("0");
    }
  });
});

/** Build a minimal INSERT for a table, aimed at another tenant. */
function insertForeignRow(table: TenantScopedTable, organizationId: string, userId: string) {
  switch (table.name) {
    case "organizations": {
      return raw`INSERT INTO organizations (id, slug, name) VALUES (${organizationId}, 'stolen', 'stolen')`;
    }
    case "memberships": {
      return raw`INSERT INTO memberships (id, organization_id, user_id, role)
                 VALUES (gen_random_uuid(), ${organizationId}, ${userId}, 'owner')`;
    }
    case "idempotency_keys": {
      return raw`INSERT INTO idempotency_keys (id, organization_id, key, route, request_hash, expires_at)
                 VALUES (gen_random_uuid(), ${organizationId}, 'x', '/x', 'x', now() + interval '1 day')`;
    }
    case "audit_log": {
      return raw`INSERT INTO audit_log (organization_id, action, outcome)
                 VALUES (${organizationId}, 'forged', 'succeeded')`;
    }
    case "api_keys": {
      return raw`INSERT INTO api_keys (id, organization_id, created_by, prefix, key_hash, name)
                 VALUES (gen_random_uuid(), ${organizationId}, ${userId}, 'atl_f', 'forged', 'f')`;
    }
    case "agent_definitions": {
      return raw`INSERT INTO agent_definitions (organization_id, agent_id, version, origin, spec)
                 VALUES (${organizationId}, 'forged-agent', 1, 'platform', '{}'::jsonb)`;
    }
    default: {
      // A new scoped table with no fixture here fails loudly rather than being
      // skipped — being skipped is how a table ends up untested for months.
      throw new Error(
        `cross-tenant suite: no INSERT fixture for "${table.name}". Add one to insertForeignRow().`,
      );
    }
  }
}
