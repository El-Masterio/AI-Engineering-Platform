import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { createTenantContext, withTenant } from "./tenant-context.js";
import { MembershipRepository, OrganizationRepository, UserRepository } from "./repository.js";
import {
  seedOrganization,
  seedUserWithMembership,
  startHarness,
  type Harness,
} from "./testing/harness.js";

/**
 * Tenant isolation, layer 3 (§15): "attempts to read and write every table as
 * the wrong tenant and asserts zero rows and denied writes."
 *
 * This is the suite the 🔒 on M004 refers to. NFR-SEC-1 makes it a release
 * blocker. Everything here runs as an ordinary role — see harness.ts for why
 * that is not a detail.
 */

let h: Harness;

const ACME = uuidv7();
const GLOBEX = uuidv7();
const acmeUser = uuidv7();
const globexUser = uuidv7();

beforeAll(async () => {
  h = await startHarness();
  await seedOrganization(h.owner, { id: ACME, slug: "acme", name: "Acme" });
  await seedOrganization(h.owner, { id: GLOBEX, slug: "globex", name: "Globex" });
  await seedUserWithMembership(h.owner, {
    userId: acmeUser,
    email: "person@acme.test",
    organizationId: ACME,
    membershipId: uuidv7(),
  });
  await seedUserWithMembership(h.owner, {
    userId: globexUser,
    email: "person@globex.test",
    organizationId: GLOBEX,
    membershipId: uuidv7(),
  });
}, 180_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

describe("FORCE ROW LEVEL SECURITY", () => {
  /**
   * ADR-003 singles this out: "without it, the table-owning role bypasses
   * policies, which quietly defeats the control." ENABLE alone would leave the
   * whole scheme looking correct and doing nothing for the owner.
   */
  it("is active on every tenancy table, not merely enabled", async () => {
    const rows = await h.owner<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN ('organizations', 'users', 'memberships')
      ORDER BY relname
    `;

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} ENABLE ROW LEVEL SECURITY`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} FORCE ROW LEVEL SECURITY`).toBe(true);
    }
  });
});

describe("cross-tenant reads", () => {
  it("shows a tenant only its own organization", async () => {
    const visible = await withTenant(h.appDb, createTenantContext(ACME), async (tx) =>
      OrganizationRepository.forTenant(tx, createTenantContext(ACME)).listVisible(),
    );

    expect(visible.map((o) => o.slug)).toEqual(["acme"]);
  });

  it("returns zero rows when the wrong tenant asks for a known id", async () => {
    // Globex asking for Acme's row. The id is real and the row exists.
    const rows = await withTenant(h.appDb, createTenantContext(GLOBEX), async (tx) =>
      tx.execute(raw`SELECT id FROM organizations WHERE id = ${ACME}`),
    );

    expect(rows).toHaveLength(0);
  });

  it("hides another tenant's memberships", async () => {
    const acme = await withTenant(h.appDb, createTenantContext(ACME), async (tx) =>
      MembershipRepository.forTenant(tx, createTenantContext(ACME)).listVisible(),
    );
    const globex = await withTenant(h.appDb, createTenantContext(GLOBEX), async (tx) =>
      MembershipRepository.forTenant(tx, createTenantContext(GLOBEX)).listVisible(),
    );

    expect(acme).toHaveLength(1);
    expect(globex).toHaveLength(1);
    expect(acme[0]?.userId).toBe(acmeUser);
    expect(globex[0]?.userId).toBe(globexUser);
  });

  it("hides people you do not share an organization with", async () => {
    const seen = await withTenant(h.appDb, createTenantContext(ACME), async (tx) =>
      UserRepository.forTenant(tx, createTenantContext(ACME)).listVisible(),
    );

    expect(seen.map((u) => u.email)).toEqual(["person@acme.test"]);
  });
});

/**
 * Drizzle wraps driver errors, so the message is "Failed query: ...". The
 * PostgreSQL SQLSTATE on the cause is the precise signal, and asserting on it
 * rather than on prose means the test does not break when a message is reworded
 * and does not pass when some unrelated failure happens to mention RLS.
 */
function sqlState(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown })?.cause;
  return (cause as { code?: string } | undefined)?.code;
}

/** insufficient_privilege — what a WITH CHECK violation raises. */
const INSUFFICIENT_PRIVILEGE = "42501";

describe("cross-tenant writes", () => {
  it("refuses an insert attributed to another organization", async () => {
    // The WITH CHECK half of the policy. Reads being filtered is not enough:
    // without WITH CHECK a tenant could write rows it would then be unable to
    // see, which is data corruption rather than a leak.
    const attempt = withTenant(h.appDb, createTenantContext(GLOBEX), async (tx) =>
      tx.execute(raw`
        INSERT INTO memberships (id, organization_id, user_id, role)
        VALUES (${uuidv7()}, ${ACME}, ${globexUser}, 'member')
      `),
    );

    let refusal: unknown;
    try {
      await attempt;
    } catch (error: unknown) {
      refusal = error;
    }
    expect(refusal, "the insert should have been refused").toBeDefined();
    expect(sqlState(refusal)).toBe(INSUFFICIENT_PRIVILEGE);

    // And nothing was written.
    const rows = await h.owner`
      SELECT id FROM memberships WHERE organization_id = ${ACME} AND user_id = ${globexUser}
    `;
    expect(rows).toHaveLength(0);
  });

  it("refuses an update to another tenant's row", async () => {
    await withTenant(h.appDb, createTenantContext(GLOBEX), async (tx) => {
      await tx.execute(raw`UPDATE organizations SET name = 'pwned' WHERE id = ${ACME}`);
    });

    // The UPDATE is not an error — it simply matches nothing, because USING
    // filtered the row out before the write was considered.
    const [row] = await h.owner<{ name: string }[]>`
      SELECT name FROM organizations WHERE id = ${ACME}
    `;
    expect(row?.name).toBe("Acme");
  });

  it("refuses a delete of another tenant's row", async () => {
    await withTenant(h.appDb, createTenantContext(GLOBEX), async (tx) => {
      await tx.execute(raw`DELETE FROM organizations WHERE id = ${ACME}`);
    });

    const rows = await h.owner`SELECT id FROM organizations WHERE id = ${ACME}`;
    expect(rows).toHaveLength(1);
  });
});

describe("the claim itself", () => {
  it("returns nothing when no organization is set — fail closed", async () => {
    // Straight through h.app, deliberately bypassing withTenant: this is what
    // a query that forgot to scope itself actually does.
    const rows = await h.app`SELECT id FROM organizations`;
    expect(rows).toHaveLength(0);
  });

  it("does not leak the claim to the next transaction on the same connection", async () => {
    // set_config(..., true) is transaction-local. If it were session-local this
    // would return Acme's row on a pooled connection, which is the exact
    // cross-tenant read PgBouncer transaction mode would make routine.
    const single = createTenantContext(ACME);
    await withTenant(h.appDb, single, async (tx) => {
      const rows = await tx.execute(raw`SELECT id FROM organizations`);
      expect(rows).toHaveLength(1);
    });

    const after = await h.app`SELECT current_setting('app.current_organization_id', true) AS claim`;
    expect(after[0]?.["claim"] ?? "").toBe("");
  });
});
