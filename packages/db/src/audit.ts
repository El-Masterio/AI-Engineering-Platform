import { and, desc, eq, lt, sql as raw } from "drizzle-orm";
import { auditLog } from "./schema/tenancy.js";
import {
  withTenant,
  type Database,
  type ScopedTransaction,
  type TenantContext,
} from "./tenant-context.js";

/**
 * Audit writing and reading (§17 Control 8, FR-AUDIT-1..5).
 *
 * The load-bearing property is completeness: "written in the same transaction
 * as the action; an action cannot exist without its record". So the write takes
 * a {@link ScopedTransaction} rather than a `Database` — it CANNOT open its own
 * transaction, which means it cannot be called after the action has already
 * committed. The type is the guarantee; a helper taking a `Database` would let
 * an audit write silently become a separate transaction that can fail on its
 * own, and the missing rows would be the ones for actions that succeeded.
 *
 * Immutability is not enforced here at all. It is a GRANT — the application
 * role holds SELECT and INSERT and nothing else — because a rule enforced in
 * application code is a rule that holds until someone writes a different query.
 */

export type AuditActorType = "user" | "api_key" | "agent" | "system";
export type AuditOutcome = "allowed" | "denied" | "succeeded" | "failed";

export type AuditEvent = {
  /** Policy action (`project:delete`) or event name (`auth.sign_in`). */
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly actorUserId?: string;
  readonly actorType?: AuditActorType;
  readonly resourceKind?: string;
  readonly resourceId?: string;
  /** Ties the row to the §16 envelope the caller was shown. */
  readonly requestId?: string;
  readonly ipAddress?: string;
  /**
   * Anything else worth keeping.
   *
   * **Redact before calling.** §17 makes a secret-shaped string in a log a P1,
   * and this is a log that is kept deliberately, forever, and is readable by
   * org admins (FR-AUDIT-5). The redaction layer from M006 is not applied here
   * because this is not a log line — passing an unredacted tool argument in is
   * a caller mistake this cannot detect.
   */
  readonly metadata?: Record<string, unknown>;
};

/**
 * Append one record, inside the caller's transaction.
 *
 * @param tx a transaction already scoped to the tenant — the only way to get
 *   one is `withTenant`, so the record cannot be written unscoped.
 */
export async function writeAudit(
  tx: ScopedTransaction,
  context: TenantContext,
  event: AuditEvent,
): Promise<void> {
  await tx.insert(auditLog).values({
    organizationId: context.organizationId,
    action: event.action,
    outcome: event.outcome,
    actorType: event.actorType ?? "user",
    ...(event.actorUserId !== undefined && { actorUserId: event.actorUserId }),
    ...(event.resourceKind !== undefined && { resourceKind: event.resourceKind }),
    ...(event.resourceId !== undefined && { resourceId: event.resourceId }),
    ...(event.requestId !== undefined && { requestId: event.requestId }),
    ...(event.ipAddress !== undefined && { ipAddress: event.ipAddress }),
    ...(event.metadata !== undefined && { metadata: event.metadata }),
  });
}

export type AuditQuery = {
  readonly action?: string;
  readonly actorUserId?: string;
  readonly outcome?: AuditOutcome;
  /** Cursor: return records strictly older than this instant (§16). */
  readonly before?: Date;
  readonly limit?: number;
};

export type AuditRecord = {
  id: string;
  action: string;
  outcome: string;
  actorUserId: string | null;
  actorType: string;
  resourceKind: string | null;
  resourceId: string | null;
  requestId: string | null;
  createdAt: Date;
  metadata: unknown;
};

/**
 * Read the log for the current tenant (FR-AUDIT-5).
 *
 * Newest first, keyset-paginated on `created_at` rather than by offset — §16's
 * reasoning applies with force here, because this is the table that is being
 * appended to while you page through it.
 */
export async function queryAudit(
  db: Database,
  context: TenantContext,
  query: AuditQuery = {},
): Promise<readonly AuditRecord[]> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

  return withTenant(db, context, async (tx) => {
    const filters = [
      ...(query.action === undefined ? [] : [eq(auditLog.action, query.action)]),
      ...(query.actorUserId === undefined ? [] : [eq(auditLog.actorUserId, query.actorUserId)]),
      ...(query.outcome === undefined ? [] : [eq(auditLog.outcome, query.outcome)]),
      ...(query.before === undefined ? [] : [lt(auditLog.createdAt, query.before)]),
    ];

    return tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        outcome: auditLog.outcome,
        actorUserId: auditLog.actorUserId,
        actorType: auditLog.actorType,
        resourceKind: auditLog.resourceKind,
        resourceId: auditLog.resourceId,
        requestId: auditLog.requestId,
        createdAt: auditLog.createdAt,
        metadata: auditLog.metadata,
      })
      .from(auditLog)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  });
}

/**
 * Create the partition for a month, if it is not there.
 *
 * Idempotent, and safe to call on every boot. A partitioned table with no
 * partition covering `now()` rejects every INSERT — and because the audit write
 * shares the action's transaction, that does not lose audit rows, it stops the
 * product working. Correct failure direction, terrible way to discover it, so
 * the scheduler that calls this monthly (M0xx) is a convenience and the boot
 * call is the safety net.
 */
export async function ensureAuditPartition(
  db: Database,
  context: TenantContext,
  month: Date = new Date(),
): Promise<string> {
  return withTenant(db, context, async (tx) => {
    const rows = await tx.execute<{ app_ensure_audit_partition: string }>(
      raw`SELECT app_ensure_audit_partition(${month.toISOString().slice(0, 10)}::date)`,
    );
    return (
      (rows as unknown as { app_ensure_audit_partition: string }[])[0]
        ?.app_ensure_audit_partition ?? ""
    );
  });
}

/**
 * Adapt a policy decision into an audit event (M017 → M018).
 *
 * §17 requires "all approvals and denials, all policy denials" to be audited,
 * and `createPolicy` emits every decision to a `DecisionSink`. This is the
 * translation between the two, kept here rather than in `packages/policy`
 * because the policy engine must not depend on the database — it is called on
 * every request and a decision that needs a connection is a decision that can
 * fail for reasons unrelated to authorization.
 *
 * The caller supplies the transaction, so the record still shares the action's
 * transaction. A denial that is not followed by an action commits on its own.
 */
export function auditEventForDecision(decision: {
  allowed: boolean;
  action: string;
  reason?: string;
  principal: { userId: string; scopes?: readonly string[] };
}): AuditEvent {
  return {
    action: decision.action,
    outcome: decision.allowed ? "allowed" : "denied",
    actorUserId: decision.principal.userId,
    actorType: decision.principal.scopes === undefined ? "user" : "api_key",
    ...(decision.reason !== undefined && { metadata: { reason: decision.reason } }),
  };
}
