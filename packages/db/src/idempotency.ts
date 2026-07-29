import { createHash } from "node:crypto";
import { and, eq, sql as raw } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { idempotencyKeys } from "./schema/tenancy.js";
import { withTenant, type Database, type TenantContext } from "./tenant-context.js";

/**
 * Idempotency (§16, migration 0005).
 *
 * "Required for run starts and any billing operation — an agent run started
 * twice costs twice." That sentence is the whole specification: this is not a
 * caching optimisation, it is the thing standing between a flaky network and a
 * double charge.
 *
 * Three outcomes a caller has to be able to tell apart, and most
 * implementations collapse the last two:
 *
 *   fresh      first use of this key      → do the work, store the response
 *   replay     same key, same request     → return the STORED response
 *   conflict   same key, DIFFERENT request → refuse (422)
 *   in flight  same key, still running     → refuse (409)
 *
 * Answering a *different* request with a stored response is the dangerous
 * mistake: the caller is told their new operation succeeded, and it never ran.
 */

const RETENTION_HOURS = 24;
const UNIQUE_VIOLATION = "23505";
/** Postgres `lock_not_available`, raised when `lock_timeout` expires. */
const LOCK_NOT_AVAILABLE = "55P03";

/**
 * How long the reservation waits before declaring the key in flight.
 *
 * A conflicting INSERT on a unique index does not fail — it **BLOCKS** until
 * the holding transaction commits or rolls back. That is the correct default
 * for most tables and completely wrong here: the transaction being waited on is
 * an agent run, which takes minutes, so a duplicate request would hold a
 * connection for minutes and the client would time out having learned nothing.
 *
 * The first version of this file had no timeout and the in-flight test hung for
 * the full 60 seconds. Any wait at all means a genuine duplicate — nobody else
 * contends for this row — so the window only has to outlast the reservation
 * INSERT itself.
 */
const RESERVATION_LOCK_TIMEOUT_MS = 250;

/** Drizzle wraps driver errors; the Postgres code sits on `.cause`. */
function hasPostgresCode(error: unknown, code: string): boolean {
  for (let current = error, depth = 0; current !== undefined && depth < 5; depth++) {
    if ((current as { code?: string }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export type IdempotencyOutcome<T> =
  | { readonly kind: "fresh"; readonly status: number; readonly body: T }
  | { readonly kind: "replay"; readonly status: number; readonly body: T }
  | { readonly kind: "conflict" }
  | { readonly kind: "in_flight" };

export type IdempotentWork<T> = () => Promise<{ status: number; body: T }>;

/** Stable hash of the request body, so a reused key with new content is caught. */
export function hashRequest(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

/**
 * Run `work` at most once per (tenant, route, key).
 *
 * The reservation INSERT and the work share ONE transaction. That is the point
 * of putting this table in Postgres rather than in Redis (which is provisioned
 * and unused): if the work committed and the key did not, a retry in that
 * window does the work twice — precisely what this exists to prevent, and
 * Redis cannot join the transaction.
 *
 * The unique index is the lock. Two simultaneous retries race on the INSERT,
 * one wins, and the loser reads what the winner is doing. A pre-flight SELECT
 * would leave a window between the check and the insert wide enough for both to
 * pass.
 */
export async function withIdempotency<T>(
  db: Database,
  context: TenantContext,
  input: { key: string; route: string; body: unknown },
  work: IdempotentWork<T>,
): Promise<IdempotencyOutcome<T>> {
  const requestHash = hashRequest(input.body);

  try {
    return await withTenant(db, context, async (tx) => {
      // Transaction-local, so it cannot leak to the next borrower of a pooled
      // connection — the same reasoning as the tenant claim in withTenant().
      // sql.raw, not an interpolation: SET does not accept a bind parameter,
      // and Drizzle's template turns ${} into one. Safe because the value is an
      // internal integer constant that never touches user input.
      await tx.execute(raw.raw(`SET LOCAL lock_timeout = ${RESERVATION_LOCK_TIMEOUT_MS}`));

      // Reserve first. A unique violation means someone finished ahead of us; a
      // lock timeout means someone is still running. Both fall through below.
      await tx.insert(idempotencyKeys).values({
        id: uuidv7(),
        organizationId: context.organizationId,
        key: input.key,
        route: input.route,
        requestHash,
        expiresAt: new Date(Date.now() + RETENTION_HOURS * 3600 * 1000),
      });

      const result = await work();

      await tx
        .update(idempotencyKeys)
        .set({
          responseStatus: result.status,
          responseBody: result.body,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(idempotencyKeys.key, input.key),
            eq(idempotencyKeys.route, input.route),
            eq(idempotencyKeys.organizationId, context.organizationId),
          ),
        );

      return { kind: "fresh" as const, status: result.status, body: result.body };
    });
  } catch (error: unknown) {
    // Still running, holding the row lock. Report it rather than waiting the
    // request out — the holder may be an agent run measured in minutes.
    if (hasPostgresCode(error, LOCK_NOT_AVAILABLE)) return { kind: "in_flight" };
    if (!hasPostgresCode(error, UNIQUE_VIOLATION)) throw error;
  }

  // Someone got here first. Read what they did — in a separate transaction,
  // because the one above rolled back.
  return withTenant(db, context, async (tx) => {
    const [existing] = await tx
      .select({
        requestHash: idempotencyKeys.requestHash,
        status: idempotencyKeys.responseStatus,
        body: idempotencyKeys.responseBody,
        completedAt: idempotencyKeys.completedAt,
      })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, input.key),
          eq(idempotencyKeys.route, input.route),
          eq(idempotencyKeys.organizationId, context.organizationId),
        ),
      )
      .limit(1);

    // Expired between the two statements, or swept. Treat as absent rather than
    // guessing — the caller retries and gets a clean reservation.
    if (existing === undefined) return { kind: "conflict" as const };

    // The dangerous case, checked FIRST. A reused key carrying different
    // content is a client bug, and answering it with the old response would
    // report success for an operation that never ran.
    if (existing.requestHash !== requestHash) return { kind: "conflict" as const };

    if (existing.completedAt === null) return { kind: "in_flight" as const };

    return {
      kind: "replay" as const,
      status: existing.status ?? 200,
      body: existing.body as T,
    };
  });
}

/**
 * Delete expired records.
 *
 * Not scheduled here — §16 sets a 24-hour retention and the scheduler is the
 * orchestrator's (M0xx). Exposed so the job has something to call, and so the
 * retention is exercised by a test rather than assumed.
 */
export async function sweepIdempotencyKeys(db: Database, context: TenantContext): Promise<number> {
  return withTenant(db, context, async (tx) => {
    const deleted = await tx
      .delete(idempotencyKeys)
      .where(raw`${idempotencyKeys.expiresAt} < now()`)
      .returning({ id: idempotencyKeys.id });
    return deleted.length;
  });
}
