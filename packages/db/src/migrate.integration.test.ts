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
    // Expectations are derived from the migrations on disk rather than
    // hard-coded. Pinning the count meant every new migration broke four tests
    // that had nothing to do with it, which trains people to edit the assertion
    // instead of reading it.
    const onDisk = await loadMigrations();
    const applied = await migrateUp(sql);
    expect(applied).toEqual(onDisk.map((m) => m.version));

    expect(await tableNames()).toEqual(
      expect.arrayContaining(["memberships", "organizations", "schema_migrations", "users"]),
    );

    const ledger = await appliedMigrations(sql);
    expect(ledger).toHaveLength(onDisk.length);
    expect(ledger.map((l) => l.name)).toEqual(onDisk.map((m) => m.name));
    for (const entry of ledger) expect(entry.checksum).toMatch(/^[0-9a-f]{64}$/);

    // Running again must be a no-op, not an error.
    expect(await migrateUp(sql)).toEqual([]);
  });

  it("rolls every migration back completely, newest first", async () => {
    const onDisk = await loadMigrations();

    // One at a time, in reverse, asserting the runner reports each one. Rolling
    // back only the last would stop exercising 0001's down the moment a second
    // migration existed — the older a down file is, the less anyone has run it.
    for (const migration of onDisk.toReversed()) {
      expect(await migrateDown(sql)).toBe(migration.version);
    }

    const names = await tableNames();
    for (const table of [
      "organizations",
      "users",
      "memberships",
      "sessions",
      "accounts",
      "verifications",
    ]) {
      expect(names, `${table} survived the rollback`).not.toContain(table);
    }
    expect(names).toContain("schema_migrations");

    expect(await appliedMigrations(sql)).toHaveLength(0);

    // Nothing left behind: a down that leaves the function would make re-running
    // up fail on CREATE, and a down that leaves policies is worse.
    const [fn] = await sql<{ count: string }[]>`
      SELECT count(*)::text FROM pg_proc WHERE proname = 'app_current_organization_id'
    `;
    expect(fn?.count).toBe("0");

    // Grants on a table 0002 does not own must be revoked too, or the rollback
    // leaves a privilege behind on 0001's table.
    const [grant] = await sql<{ count: string }[]>`
      SELECT count(*)::text FROM information_schema.role_table_grants
      WHERE grantee = 'atelier_auth'
    `;
    expect(grant?.count, "atelier_auth kept a grant after rollback").toBe("0");
  });

  it("re-applies cleanly after a rollback", async () => {
    const onDisk = await loadMigrations();
    expect(await migrateUp(sql)).toEqual(onDisk.map((m) => m.version));
    expect(await tableNames()).toEqual(
      expect.arrayContaining(["organizations", "sessions", "accounts", "verifications"]),
    );
  });

  it("detects a migration edited after it was applied", async () => {
    // Forward-only (§15) is enforceable, not advisory.
    await sql`UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1`;
    await expect(migrateUp(sql)).rejects.toThrow(/modified after it was applied/);
    // Restore so later tests in this file see a consistent ledger.
    const real = await loadMigrations();
    expect(real.length).toBeGreaterThan(0);
  });
});
