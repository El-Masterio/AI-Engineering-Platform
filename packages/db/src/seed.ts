import type { Sql } from "postgres";

/**
 * Synthetic development seed.
 *
 * M010 acceptance says "seeds are synthetic only". That is a promise that
 * decays the first time someone pastes a real customer row in to reproduce a
 * bug, so it is enforced rather than stated: every address uses an RFC 2606
 * reserved domain, every organisation is obviously fictional, and seed.test.ts
 * fails the build if either stops being true.
 *
 * Ids are fixed rather than generated. A developer who writes
 * `/projects/<id>` into a note, a bookmark or a test wants it to still work
 * after `pnpm db:reset` — and a fixed id makes a failing seed obvious, because
 * the row is either there or it is not.
 *
 * These are valid UUIDv7s with a fixed timestamp prefix; nothing here depends
 * on them being time-ordered, only on them being stable.
 */

export const SEED_ORGANIZATIONS = [
  {
    id: "01900000-0000-7000-8000-000000000001",
    slug: "northwind",
    name: "Northwind Traders",
    plan: "team",
  },
  {
    id: "01900000-0000-7000-8000-000000000002",
    slug: "initech",
    name: "Initech",
    plan: "free",
  },
] as const;

/**
 * `example.test` is reserved by RFC 2606 and can never be registered, so a
 * seed address cannot collide with a real inbox even by accident.
 */
export const SEED_USERS = [
  {
    id: "01900000-0000-7000-8000-000000000101",
    email: "ada@example.test",
    name: "Ada Lovelace",
  },
  {
    id: "01900000-0000-7000-8000-000000000102",
    email: "grace@example.test",
    name: "Grace Hopper",
  },
  {
    id: "01900000-0000-7000-8000-000000000103",
    email: "alan@example.test",
    name: "Alan Turing",
  },
] as const;

export const SEED_MEMBERSHIPS = [
  {
    id: "01900000-0000-7000-8000-000000000201",
    organizationId: SEED_ORGANIZATIONS[0].id,
    userId: SEED_USERS[0].id,
    role: "owner",
  },
  {
    id: "01900000-0000-7000-8000-000000000202",
    organizationId: SEED_ORGANIZATIONS[0].id,
    userId: SEED_USERS[1].id,
    role: "member",
  },
  // Deliberately a DIFFERENT organisation: with only one tenant seeded, a
  // cross-tenant leak looks identical to correct behaviour when you click
  // around locally.
  {
    id: "01900000-0000-7000-8000-000000000203",
    organizationId: SEED_ORGANIZATIONS[1].id,
    userId: SEED_USERS[2].id,
    role: "owner",
  },
] as const;

export type SeedSummary = {
  organizations: number;
  users: number;
  memberships: number;
};

/**
 * Insert the seed, idempotently.
 *
 * `ON CONFLICT DO NOTHING` rather than upsert: re-running must be safe, but a
 * seed that overwrote local edits would destroy whatever the developer was
 * halfway through testing.
 *
 * Runs as the migrating role, which owns the tables. RLS is `FORCE`d, so an
 * ordinary connection could not insert across two organisations anyway — that
 * is the control working, not a problem to route around.
 */
export async function seed(sql: Sql): Promise<SeedSummary> {
  await sql.begin(async (tx) => {
    for (const organization of SEED_ORGANIZATIONS) {
      await tx`
        INSERT INTO organizations (id, slug, name, plan)
        VALUES (${organization.id}, ${organization.slug}, ${organization.name}, ${organization.plan})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    for (const user of SEED_USERS) {
      await tx`
        INSERT INTO users (id, email, name, email_verified_at)
        VALUES (${user.id}, ${user.email}, ${user.name}, now())
        ON CONFLICT (id) DO NOTHING
      `;
    }
    for (const membership of SEED_MEMBERSHIPS) {
      await tx`
        INSERT INTO memberships (id, organization_id, user_id, role, accepted_at)
        VALUES (${membership.id}, ${membership.organizationId}, ${membership.userId},
                ${membership.role}, now())
        ON CONFLICT (id) DO NOTHING
      `;
    }
  });

  return {
    organizations: SEED_ORGANIZATIONS.length,
    users: SEED_USERS.length,
    memberships: SEED_MEMBERSHIPS.length,
  };
}
