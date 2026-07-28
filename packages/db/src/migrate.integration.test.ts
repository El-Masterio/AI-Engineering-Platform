import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Sql } from "postgres";
import { createClient } from "./client.js";
import { appliedMigrations, loadMigrations, migrateDown, migrateUp } from "./migrate.js";
import { POSTGRES_IMAGE } from "./testing/harness.js";

/** M004 acceptance: "Migration applies and rolls back." */

let container: StartedPostgreSqlContainer;
let sql: Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  sql = createClient({ connectionString: container.getConnectionUri(), max: 4 });
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await container?.stop();
}, 60_000);

async function tableNames(): Promise<string[]> {
  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  return rows.map((r) => r.tablename);
}

describe("migration runner", () => {
  it("refuses a migration with no down file", async () => {
    // The rule is only real if the runner enforces it, so prove it does.
    // Relative to this file, not to the working directory — vitest runs from
    // packages/db here but from the repo root under a workspace runner.
    const orphan = fileURLToPath(
      new URL("../migrations/9999_orphan_with_no_down.up.sql", import.meta.url),
    );
    await writeFile(orphan, "SELECT 1;\n", "utf8");
    try {
      await expect(loadMigrations()).rejects.toThrow(/no \.down\.sql/);
    } finally {
      await rm(orphan, { force: true });
    }
  });

  it("applies, records, and is idempotent", async () => {
    const applied = await migrateUp(sql);
    expect(applied).toEqual([1]);

    expect(await tableNames()).toEqual(
      expect.arrayContaining(["memberships", "organizations", "schema_migrations", "users"]),
    );

    const ledger = await appliedMigrations(sql);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.name).toBe("create_tenancy_and_identity");
    expect(ledger[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);

    // Running again must be a no-op, not an error.
    expect(await migrateUp(sql)).toEqual([]);
  });

  it("rolls the last migration back completely", async () => {
    const rolledBack = await migrateDown(sql);
    expect(rolledBack).toBe(1);

    const names = await tableNames();
    expect(names).not.toContain("organizations");
    expect(names).not.toContain("users");
    expect(names).not.toContain("memberships");
    expect(names).toContain("schema_migrations");

    expect(await appliedMigrations(sql)).toHaveLength(0);

    // Nothing left behind: a down that leaves the function would make re-running
    // up fail on CREATE, and a down that leaves policies is worse.
    const [fn] = await sql<{ count: string }[]>`
      SELECT count(*)::text FROM pg_proc WHERE proname = 'app_current_organization_id'
    `;
    expect(fn?.count).toBe("0");
  });

  it("re-applies cleanly after a rollback", async () => {
    expect(await migrateUp(sql)).toEqual([1]);
    expect(await tableNames()).toEqual(expect.arrayContaining(["organizations"]));
  });

  it("detects a migration edited after it was applied", async () => {
    // Forward-only (§15) is enforceable, not advisory.
    await sql`UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1`;
    await expect(migrateUp(sql)).rejects.toThrow(/modified after it was applied/);
    // Restore so later tests in this file see a consistent ledger.
    const real = await loadMigrations();
    expect(real).toHaveLength(1);
  });
});
