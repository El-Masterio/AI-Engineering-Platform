import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { createClient } from "./client.js";
import { migrateUp } from "./migrate.js";
import { seed, SEED_MEMBERSHIPS, SEED_ORGANIZATIONS, SEED_USERS } from "./seed.js";
import { POSTGRES_IMAGE } from "./testing/harness.js";

/** The seed has to actually apply against the real schema, not just typecheck. */

let container: StartedPostgreSqlContainer;
let sql: Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  sql = createClient({ connectionString: container.getConnectionUri(), max: 4 });
  await migrateUp(sql);
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await container?.stop();
}, 60_000);

async function count(table: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM ${sql(table)}`;
  return Number(rows[0]?.count ?? 0);
}

describe("seed", () => {
  it("applies against the migrated schema", async () => {
    const summary = await seed(sql);

    expect(summary).toEqual({
      organizations: SEED_ORGANIZATIONS.length,
      users: SEED_USERS.length,
      memberships: SEED_MEMBERSHIPS.length,
    });
    expect(await count("organizations")).toBe(SEED_ORGANIZATIONS.length);
    expect(await count("users")).toBe(SEED_USERS.length);
    expect(await count("memberships")).toBe(SEED_MEMBERSHIPS.length);
  });

  it("is idempotent — re-running inserts nothing and throws nothing", async () => {
    // `pnpm db:seed` gets run twice by anyone who forgets they already did.
    await seed(sql);
    await seed(sql);

    expect(await count("organizations")).toBe(SEED_ORGANIZATIONS.length);
    expect(await count("memberships")).toBe(SEED_MEMBERSHIPS.length);
  });

  it("does not overwrite local edits", async () => {
    // ON CONFLICT DO NOTHING rather than upsert: re-seeding must not destroy
    // whatever the developer was halfway through testing.
    await sql`UPDATE organizations SET name = 'Renamed Locally' WHERE slug = 'northwind'`;
    await seed(sql);

    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM organizations WHERE slug = 'northwind'
    `;
    expect(row?.name).toBe("Renamed Locally");
  });

  it("satisfies the constraints the migration declares", async () => {
    // A seed that only works because constraints are lax is a seed that breaks
    // the moment they are tightened.
    const [roles] = await sql<{ bad: string }[]>`
      SELECT count(*)::text AS bad FROM memberships
      WHERE role NOT IN ('owner', 'admin', 'member', 'viewer')
    `;
    expect(roles?.bad).toBe("0");

    const [plans] = await sql<{ bad: string }[]>`
      SELECT count(*)::text AS bad FROM organizations
      WHERE plan NOT IN ('free', 'team', 'enterprise')
    `;
    expect(plans?.bad).toBe("0");
  });
});
