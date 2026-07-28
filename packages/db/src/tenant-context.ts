import { sql as raw } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

/**
 * Tenant isolation, layer 2 (§15).
 *
 * Layer 1 is RLS in the database. This is the application guard in front of it,
 * and §15 is explicit about why both exist: if a policy is misconfigured the
 * guard catches it, and if the guard is bypassed RLS catches it. Neither is
 * allowed to be the only thing standing between two customers.
 *
 * The guard is built out of types rather than discipline. A repository cannot
 * be constructed without a `TenantContext`, and a `TenantContext` cannot be
 * built from a bare string — so "I forgot to scope this query" is a compile
 * error rather than a code-review responsibility.
 */

declare const organizationIdBrand: unique symbol;

/**
 * A validated organization id.
 *
 * Branded so it cannot be produced by assignment. `const id: OrganizationId =
 * request.params.orgId` does not compile; it has to pass through
 * {@link toOrganizationId}, which is where the format is actually checked.
 */
export type OrganizationId = string & { readonly [organizationIdBrand]: "OrganizationId" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOrganizationId(value: unknown): value is OrganizationId {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** @throws if the value is not a UUID. Validation happens once, at the boundary. */
export function toOrganizationId(value: string): OrganizationId {
  if (!isOrganizationId(value)) {
    throw new TypeError(`Not a valid organization id: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Everything a query needs in order to be safely scoped.
 *
 * Deliberately not "the current user" — authorization is the policy engine's
 * job (§17). This carries only what tenant isolation itself requires, so the
 * type does not quietly become a god-object for request context.
 */
export type TenantContext = {
  readonly organizationId: OrganizationId;
};

export function createTenantContext(organizationId: string): TenantContext {
  return Object.freeze({ organizationId: toOrganizationId(organizationId) });
}

/** Drizzle handle over a postgres.js connection. */
export type Database = PostgresJsDatabase<Record<string, never>>;

export function createDatabase(client: Sql): Database {
  return drizzle(client);
}

declare const scopedBrand: unique symbol;

type DrizzleTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * A transaction with `app.current_organization_id` already set.
 *
 * Branded for the same reason as the id: it marks a handle that has been
 * scoped, so a function requiring `ScopedTransaction` cannot be handed an
 * ordinary connection. That is what makes the unsafe call a type error rather
 * than a runtime surprise.
 */
export type ScopedTransaction = DrizzleTransaction & {
  readonly [scopedBrand]: "ScopedTransaction";
};

/**
 * Run `work` inside a transaction scoped to one organization.
 *
 * `set_config(..., true)` is transaction-LOCAL — that third argument is the
 * most important detail in this file. With `false` the setting is
 * session-local, and on a pooled connection it leaks to whichever request
 * borrows the connection next: a cross-tenant read caused entirely by a
 * boolean. PgBouncer in transaction mode (ADR-003) makes that certain rather
 * than unlikely.
 */
export async function withTenant<T>(
  db: Database,
  context: TenantContext,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      raw`SELECT set_config('app.current_organization_id', ${context.organizationId}, true)`,
    );
    return work(tx as ScopedTransaction);
  });
}
