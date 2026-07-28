import postgres from "postgres";
import type { Sql } from "postgres";

/**
 * Connection factory.
 *
 * Two settings here are consequences of ADR-003's choice of PgBouncer in
 * transaction mode, and both are easy to get wrong:
 *
 *   prepare: false   PgBouncer in transaction mode hands a different backend to
 *                    each transaction, so a prepared statement created on one
 *                    is not there on the next. postgres.js prepares by default.
 *
 *   max              the pool is per-process. Behind PgBouncer the useful limit
 *                    is the pooler's, not ours, so this stays small and the real
 *                    sizing decision lives with the pooler.
 */
export type ClientOptions = {
  connectionString: string;
  /** Max connections in this process's pool. */
  max?: number;
  /** Leave prepared statements on ONLY when connecting directly, not via PgBouncer. */
  prepare?: boolean;
  onNotice?: (notice: unknown) => void;
};

export function createClient(options: ClientOptions): Sql {
  const { connectionString, max = 10, prepare = false, onNotice } = options;
  return postgres(connectionString, {
    max,
    prepare,
    // Return timestamptz as Date; everything is UTC by convention (§15).
    types: {},
    ...(onNotice && { onnotice: onNotice }),
  });
}
