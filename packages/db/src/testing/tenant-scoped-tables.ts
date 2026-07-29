import type { Sql } from "postgres";

/**
 * Discover the tenant-scoped surface **from the database**, not from a list.
 *
 * This is the whole idea behind M021. A hand-written list of tables to check
 * stops being complete the moment someone adds a table, and it does so
 * silently: the suite still passes, still looks thorough, and no longer covers
 * the thing that was just introduced. The failure mode of a cross-tenant test
 * suite is not "it fails" — it is "it passes and means less than it did".
 *
 * So the suite asks Postgres what exists and generates a case per table. Adding
 * a table with an `organization_id` and no policy makes the suite fail without
 * anyone remembering to extend it, which is the acceptance criterion.
 */

export type TenantScopedTable = {
  readonly name: string;
  /** The column that carries the tenant. */
  readonly tenantColumn: string;
  readonly rlsEnabled: boolean;
  readonly rlsForced: boolean;
  readonly policies: readonly string[];
  /** What `atelier_app` may do — a table it cannot write needs no write test. */
  readonly grants: readonly string[];
};

/**
 * `organizations` carries its tenant in `id` rather than `organization_id`.
 *
 * Listed explicitly because the discovery query keys on the column name, and
 * the tenant table itself is the one exception. Missing it would leave the
 * root of the tenancy model untested — which is the last table anyone would
 * notice was missing.
 */
const TENANT_COLUMN_OVERRIDES: Readonly<Record<string, string>> = { organizations: "id" };

/**
 * Tables that legitimately carry no tenant.
 *
 * Every entry needs a reason, because this list is the only way a table can
 * escape the suite — and an unjustified entry is how a real table gets
 * excluded and nobody notices.
 */
export const NON_TENANT_TABLES: Readonly<Record<string, string>> = Object.freeze({
  schema_migrations: "The migration runner's own ledger. Predates tenancy and has no tenant.",
  users: "Identity is global — a person may belong to several organizations (ADR-010).",
  sessions: "Belongs to a person, not an organization; guarded by role, not by RLS scope.",
  accounts: "Credentials. atelier_app has NO grant at all, which is stronger than a policy.",
  verifications: "Email/reset tokens, scoped to an identity rather than a tenant.",
});

/**
 * Every table Postgres knows about, with its tenancy facts.
 *
 * Partitions are excluded: they inherit the parent's policies, so testing each
 * month separately would add cases that assert the same thing and would make
 * the suite grow forever.
 */
export async function discoverTables(sql: Sql): Promise<readonly TenantScopedTable[]> {
  const rows = await sql<
    {
      table_name: string;
      tenant_column: string | null;
      rls_enabled: boolean;
      rls_forced: boolean;
      policies: string[];
      grants: string[];
    }[]
  >`
    SELECT
      c.relname AS table_name,
      (
        SELECT a.attname
        FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'organization_id'
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS tenant_column,
      c.relrowsecurity  AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      COALESCE(
        (SELECT array_agg(p.polname) FROM pg_policy p WHERE p.polrelid = c.oid),
        '{}'
      ) AS policies,
      COALESCE(
        (
          SELECT array_agg(DISTINCT g.privilege_type)
          FROM information_schema.role_table_grants g
          WHERE g.table_name = c.relname
            AND g.table_schema = 'public'
            AND g.grantee = 'atelier_app'
        ),
        '{}'
      ) AS grants
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relispartition = false
    ORDER BY c.relname
  `;

  return rows.map((row) => ({
    name: row.table_name,
    tenantColumn: TENANT_COLUMN_OVERRIDES[row.table_name] ?? row.tenant_column ?? "",
    rlsEnabled: row.rls_enabled,
    rlsForced: row.rls_forced,
    policies: row.policies,
    grants: row.grants,
  }));
}

/** Tables the suite must generate isolation cases for. */
export function tenantScopedTables(
  tables: readonly TenantScopedTable[],
): readonly TenantScopedTable[] {
  return tables.filter(
    (table) => table.tenantColumn !== "" && !Object.hasOwn(NON_TENANT_TABLES, table.name),
  );
}

/**
 * Tables that carry no tenant column and have no recorded reason.
 *
 * The acceptance criterion in one function: a new table either scopes itself by
 * `organization_id`, or someone writes down why it does not. There is no third
 * option that passes.
 */
export function unaccountedTables(tables: readonly TenantScopedTable[]): readonly string[] {
  return tables
    .filter((table) => table.tenantColumn === "" && !Object.hasOwn(NON_TENANT_TABLES, table.name))
    .map((table) => table.name);
}
