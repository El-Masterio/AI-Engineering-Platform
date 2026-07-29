import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Sql } from "postgres";
import { createClient } from "./client.js";
import { migrateUp } from "./migrate.js";
import { auditLog, idempotencyKeys, memberships, organizations, users } from "./schema/tenancy.js";
import { accounts, sessions, verifications } from "./schema/authentication.js";
import { POSTGRES_IMAGE } from "./testing/harness.js";

/**
 * Schema drift.
 *
 * M004 deliberately splits DDL from the query layer: SQL migrations are the
 * source of truth (§15 wants named, reviewed, reversible migrations, and
 * drizzle-kit gives none of the three), while Drizzle provides the typed
 * surface queries are written against.
 *
 * That split has exactly one serious failure mode — the two descriptions of the
 * same table disagreeing — and its symptom is a query that type-checks, passes
 * review, and throws in production. This suite is the price of the split: it
 * introspects the migrated database and fails if the two ever diverge.
 *
 * Without it the design would be strictly worse than just using drizzle-kit.
 */

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

type IntrospectedColumn = { column_name: string; data_type: string; is_nullable: "YES" | "NO" };

async function introspect(tableName: string): Promise<IntrospectedColumn[]> {
  return sql<IntrospectedColumn[]>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY column_name
  `;
}

/** Drizzle's column type names → the information_schema spellings. */
const TYPE_EQUIVALENTS: Record<string, string> = {
  PgUUID: "uuid",
  PgText: "text",
  PgJsonb: "jsonb",
  PgTimestampString: "timestamp with time zone",
  PgTimestamp: "timestamp with time zone",
};

const TABLES: { drizzle: PgTable; name: string }[] = [
  { drizzle: organizations, name: "organizations" },
  { drizzle: users, name: "users" },
  { drizzle: memberships, name: "memberships" },
  { drizzle: sessions, name: "sessions" },
  { drizzle: accounts, name: "accounts" },
  { drizzle: verifications, name: "verifications" },
  { drizzle: idempotencyKeys, name: "idempotency_keys" },
  { drizzle: auditLog, name: "audit_log" },
];

describe("the Drizzle schema matches the migrated database", () => {
  it.each(TABLES.map((t) => t.name))("%s has the same columns in both", async (name) => {
    const table = TABLES.find((t) => t.name === name);
    if (table === undefined) throw new Error(`no such table in the test table: ${name}`);

    const declared = getTableConfig(table.drizzle).columns;
    const actual = await introspect(name);

    expect(actual.length, `${name} exists in the database`).toBeGreaterThan(0);

    expect(
      actual.map((c) => c.column_name).toSorted((a, b) => a.localeCompare(b)),
      `${name}: column names must match between the migration and the Drizzle schema`,
    ).toEqual(declared.map((c) => c.name).toSorted((a, b) => a.localeCompare(b)));
  });

  it.each(TABLES.map((t) => t.name))("%s agrees on type and nullability", async (name) => {
    const table = TABLES.find((t) => t.name === name);
    if (table === undefined) throw new Error(`no such table in the test table: ${name}`);

    const declared = new Map(getTableConfig(table.drizzle).columns.map((c) => [c.name, c]));
    const actual = await introspect(name);

    const mismatches: string[] = [];
    for (const column of actual) {
      const drizzleColumn = declared.get(column.column_name);
      if (drizzleColumn === undefined) continue; // reported by the previous test

      const expectedType = TYPE_EQUIVALENTS[drizzleColumn.constructor.name];
      if (expectedType !== undefined && expectedType !== column.data_type) {
        mismatches.push(
          `${name}.${column.column_name}: database is ${column.data_type}, Drizzle says ${drizzleColumn.constructor.name}`,
        );
      }

      const isNotNullInDatabase = column.is_nullable === "NO";
      if (isNotNullInDatabase !== drizzleColumn.notNull) {
        mismatches.push(
          `${name}.${column.column_name}: database notNull=${isNotNullInDatabase}, Drizzle notNull=${drizzleColumn.notNull}`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("every table the migration creates is declared in Drizzle", async () => {
    // `relispartition = false` excludes audit_log's monthly partitions. They
    // are one logical table with one Drizzle definition; listing each month
    // here would make this test fail on the first of every month.
    const rows = await sql<{ tablename: string }[]>`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relispartition = false
        AND c.relname <> 'schema_migrations'
      ORDER BY c.relname
    `;

    // schema_migrations is the runner's own ledger and deliberately has no
    // Drizzle definition — nothing queries it through the ORM.
    expect(rows.map((r) => r.tablename)).toEqual(
      TABLES.map((t) => t.name).toSorted((a, b) => a.localeCompare(b)),
    );
  });
});
