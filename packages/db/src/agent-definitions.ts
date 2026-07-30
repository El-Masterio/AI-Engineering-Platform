import { and, desc, eq, sql as raw } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { agentDefinitions, type AgentOrigin } from "./schema/agents.js";
import type { ScopedTransaction } from "./tenant-context.js";

/**
 * Agent definitions as versioned, pinned data (§13, M024).
 *
 * Three operations, and the interesting one is `pinForRun`.
 *
 * The acceptance criterion is "versions immutable once referenced by a run".
 * That is enforced twice on purpose: here, with a clear error naming the file
 * and telling the author to bump the version, and in the database, by a trigger
 * that refuses the UPDATE regardless of which code path issued it. The first is
 * for the human; the second is what makes the guarantee true. A test drives a
 * raw UPDATE past this module to prove the trigger is doing real work rather
 * than sitting behind a check that always fires first.
 */

/**
 * Postgres `restrict_violation`, raised by the immutability triggers.
 *
 * `23001`, verified against a real server rather than recalled — the first value
 * here was `2BF01`, which is not a Postgres code at all. The test still saw an
 * error thrown, so only asserting "something failed" would have passed while the
 * classifier silently matched nothing.
 */
const RESTRICT_VIOLATION = "23001";

/**
 * A published version was asked to change.
 *
 * Distinct from a generic error because the caller — the loader, at boot — has
 * something specific and actionable to say: the file on disk disagrees with
 * history, and the fix is a new version rather than a retry.
 */
export class PublishedDefinitionConflictError extends Error {
  readonly agentId: string;
  readonly version: number;

  constructor(agentId: string, version: number) {
    super(
      `agent "${agentId}" version ${version} has already been used by a run and cannot be ` +
        `changed. Increment \`version\` in its definition file to publish a new one.`,
    );
    this.name = "PublishedDefinitionConflictError";
    this.agentId = agentId;
    this.version = version;
  }
}

export type AgentDefinitionRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly agentId: string;
  readonly version: number;
  readonly origin: AgentOrigin;
  readonly spec: unknown;
  readonly publishedAt: Date | null;
};

export type UpsertAgentDefinition = {
  readonly agentId: string;
  readonly version: number;
  readonly origin: AgentOrigin;
  /** Already validated by `parseAgentSpec` — this layer stores, it does not judge. */
  readonly spec: unknown;
};

/** Drizzle wraps driver errors; the Postgres code sits on `.cause`. */
function hasPostgresCode(error: unknown, code: string): boolean {
  for (let current = error, depth = 0; current !== undefined && depth < 5; depth++) {
    if ((current as { code?: string }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Store a definition, or confirm the stored one already matches.
 *
 * Idempotent by design: the loader runs on every boot with the same files, and
 * a boot that rewrote rows it did not need to would churn `updated_at` on every
 * deploy and make the audit trail noise.
 *
 * Equality is decided by Postgres comparing `jsonb`, not by string comparison in
 * JavaScript. `JSON.stringify` output depends on key insertion order, so two
 * identical specs loaded from the same file in different orders would compare
 * unequal — and the loader would try to rewrite a published row on every boot.
 */
export async function upsertAgentDefinition(
  tx: ScopedTransaction,
  input: UpsertAgentDefinition,
): Promise<AgentDefinitionRecord> {
  const json = JSON.stringify(input.spec);

  const [existing] = await tx
    .select({
      id: agentDefinitions.id,
      organizationId: agentDefinitions.organizationId,
      agentId: agentDefinitions.agentId,
      version: agentDefinitions.version,
      origin: agentDefinitions.origin,
      spec: agentDefinitions.spec,
      publishedAt: agentDefinitions.publishedAt,
      matches: raw<boolean>`${agentDefinitions.spec} = ${json}::jsonb`,
    })
    .from(agentDefinitions)
    .where(
      and(eq(agentDefinitions.agentId, input.agentId), eq(agentDefinitions.version, input.version)),
    )
    .limit(1);

  if (existing === undefined) {
    const [inserted] = await tx
      .insert(agentDefinitions)
      .values({
        id: uuidv7(),
        organizationId: raw`app_current_organization_id()`,
        agentId: input.agentId,
        version: input.version,
        origin: input.origin,
        spec: input.spec,
      })
      .returning();

    if (inserted === undefined) {
      // RLS filters INSERT ... RETURNING through the policy, so an empty return
      // means the row was written for a tenant the caller cannot see — which
      // should be impossible given the organization_id above.
      throw new Error(`failed to store agent definition ${input.agentId}@${input.version}`);
    }
    return toRecord(inserted);
  }

  if (existing.matches) return toRecord(existing);

  // The file differs from what is stored. Allowed while unpublished — a role
  // under development is edited constantly — and refused once a run has used it.
  if (existing.publishedAt !== null) {
    throw new PublishedDefinitionConflictError(input.agentId, input.version);
  }

  const [updated] = await tx
    .update(agentDefinitions)
    .set({ spec: input.spec, origin: input.origin, updatedAt: new Date() })
    .where(eq(agentDefinitions.id, existing.id))
    .returning();

  return toRecord(updated ?? existing);
}

/**
 * Pin a version for a run, publishing it.
 *
 * Called once, when a run is about to start. After this the row is frozen, which
 * is the whole point: whatever the run did, the spec it did it under is still
 * readable afterwards and is exactly what it was at the time.
 *
 * Publishing an already-published version is a no-op rather than an error. Two
 * runs starting concurrently on the same version is normal, and the second one
 * has nothing to complain about.
 */
export async function pinForRun(
  tx: ScopedTransaction,
  agentId: string,
  version: number,
): Promise<AgentDefinitionRecord> {
  const [pinned] = await tx
    .update(agentDefinitions)
    .set({ publishedAt: raw`now()` })
    .where(
      and(
        eq(agentDefinitions.agentId, agentId),
        eq(agentDefinitions.version, version),
        // Only an unpublished row is touched. Setting published_at again would
        // move the timestamp — and the trigger refuses that, correctly, because
        // "when was this first used" is a fact and not a field to refresh.
        raw`${agentDefinitions.publishedAt} IS NULL`,
      ),
    )
    .returning();

  if (pinned !== undefined) return toRecord(pinned);

  const existing = await findAgentDefinition(tx, agentId, version);
  if (existing === undefined) {
    throw new Error(`no agent definition ${agentId}@${version} for this organization`);
  }
  return existing;
}

export async function findAgentDefinition(
  tx: ScopedTransaction,
  agentId: string,
  version: number,
): Promise<AgentDefinitionRecord | undefined> {
  const [row] = await tx
    .select()
    .from(agentDefinitions)
    .where(and(eq(agentDefinitions.agentId, agentId), eq(agentDefinitions.version, version)))
    .limit(1);

  return row === undefined ? undefined : toRecord(row);
}

/**
 * The highest version of a role.
 *
 * What a new run resolves against. An in-flight run never re-resolves — it
 * carries the version it pinned — so publishing a new version cannot change a
 * run that is already going.
 */
export async function findLatestAgentDefinition(
  tx: ScopedTransaction,
  agentId: string,
): Promise<AgentDefinitionRecord | undefined> {
  const [row] = await tx
    .select()
    .from(agentDefinitions)
    .where(eq(agentDefinitions.agentId, agentId))
    .orderBy(desc(agentDefinitions.version))
    .limit(1);

  return row === undefined ? undefined : toRecord(row);
}

export async function listAgentDefinitions(
  tx: ScopedTransaction,
): Promise<readonly AgentDefinitionRecord[]> {
  const rows = await tx
    .select()
    .from(agentDefinitions)
    .orderBy(agentDefinitions.agentId, desc(agentDefinitions.version));

  return rows.map((row) => toRecord(row));
}

/** True if this error is the immutability trigger refusing a write. */
export function isImmutabilityViolation(error: unknown): boolean {
  return hasPostgresCode(error, RESTRICT_VIOLATION);
}

function toRecord(row: {
  id: string;
  organizationId: string;
  agentId: string;
  version: number;
  origin: string;
  spec: unknown;
  publishedAt: Date | null;
}): AgentDefinitionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentId: row.agentId,
    version: row.version,
    origin: row.origin as AgentOrigin,
    spec: row.spec,
    publishedAt: row.publishedAt,
  };
}
