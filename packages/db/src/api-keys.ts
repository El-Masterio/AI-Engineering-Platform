import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql as raw } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { apiKeys } from "./schema/tenancy.js";
import { withTenant, type Database, type TenantContext } from "./tenant-context.js";

/**
 * API keys (§16, M019).
 *
 * `atl_<prefix>_<secret>`. The prefix is public and shown in lists so two keys
 * can be told apart; the secret is shown once, at creation, and never again.
 */

const KEY_PREFIX = "atl";
/** 32 bytes = 256 bits. Guessing is not a threat model at this size. */
const SECRET_BYTES = 32;
/** Enough to disambiguate a list, short enough to be useless on its own. */
const PUBLIC_PREFIX_LENGTH = 8;

/**
 * SHA-256, and deliberately NOT Argon2id.
 *
 * This is the opposite choice to M014's passwords, for the opposite reason. A
 * password is low-entropy and human-chosen, so the hash must be *slow* to make
 * guessing expensive. An API key is 256 bits of CSPRNG output — there is no
 * guessing attack to slow down, and the dictionary a slow hash defends against
 * does not exist.
 *
 * Making this Argon2id would cost 19 MiB and ~50 ms of CPU **on every
 * authenticated request**, which is a denial-of-service vector wearing the
 * costume of extra security: an attacker with a list of invalid keys could
 * exhaust the machine's memory bandwidth without ever authenticating.
 */
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: readonly string[];
  createdBy: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type IssuedApiKey = {
  readonly record: ApiKeyRecord;
  /**
   * The full key, in plaintext.
   *
   * Returned exactly once and never recoverable — nothing stores it. §16 and
   * the acceptance criterion both say "shown once only", and the way to make
   * that true is for the only copy to be this return value.
   */
  readonly secret: string;
};

export type IssueApiKeyInput = {
  readonly name: string;
  readonly createdBy: string;
  readonly scopes: readonly string[];
  readonly expiresAt?: Date;
};

export async function issueApiKey(
  db: Database,
  context: TenantContext,
  input: IssueApiKeyInput,
): Promise<IssuedApiKey> {
  // base64url so the key survives a header, a shell and a URL untouched.
  const secretPart = randomBytes(SECRET_BYTES).toString("base64url");
  const secret = `${KEY_PREFIX}_${secretPart}`;
  const prefix = `${KEY_PREFIX}_${secretPart.slice(0, PUBLIC_PREFIX_LENGTH)}`;

  const record = await withTenant(db, context, async (tx) => {
    const [row] = await tx
      .insert(apiKeys)
      .values({
        id: uuidv7(),
        organizationId: context.organizationId,
        createdBy: input.createdBy,
        name: input.name,
        prefix,
        keyHash: hashSecret(secret),
        scopes: [...input.scopes],
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
      })
      .returning();
    return row;
  });

  if (record === undefined) throw new Error("Failed to issue an API key.");

  return {
    secret,
    record: {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      createdBy: record.createdBy,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    },
  };
}

export type ResolvedApiKey = {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly scopes: readonly string[];
};

/**
 * Resolve an inbound `Authorization: Bearer` value to a principal.
 *
 * Returns undefined for anything that is not a live key — wrong shape, unknown,
 * revoked or expired. **One answer for all four**, because distinguishing them
 * tells an attacker which of their guesses was once real.
 *
 * No tenant context, because there is none yet: which organization the caller
 * belongs to is what this call determines. It goes through a narrow
 * SECURITY DEFINER function rather than a widened RLS policy, so the exemption
 * is one auditable statement in the migration.
 */
export async function resolveApiKey(
  db: Database,
  bearer: string | undefined,
): Promise<ResolvedApiKey | undefined> {
  if (bearer === undefined) return undefined;

  const value = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : bearer.trim();
  if (!value.startsWith(`${KEY_PREFIX}_`)) return undefined;

  const rows = (await db.execute(
    raw`SELECT id, organization_id, created_by, scopes FROM app_resolve_api_key(${hashSecret(value)})`,
  )) as unknown as {
    id: string;
    organization_id: string;
    created_by: string;
    scopes: string[];
  }[];

  const row = rows[0];
  if (row === undefined) return undefined;

  await db.execute(raw`SELECT app_touch_api_key(${row.id})`);

  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.created_by,
    scopes: row.scopes,
  };
}

/**
 * Constant-time comparison of two key strings.
 *
 * Not used by {@link resolveApiKey} — that looks up by hash, so there is no
 * pair to compare. Exported for callers that must compare a key to a known
 * value (a webhook shared secret, a test fixture), because `===` on a secret
 * leaks its prefix through timing one byte at a time.
 */
export function isMatchingSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which is itself a leak — so
  // compare fixed-size digests rather than the raw values.
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}

export async function listApiKeys(
  db: Database,
  context: TenantContext,
): Promise<readonly ApiKeyRecord[]> {
  return withTenant(db, context, async (tx) =>
    tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        createdBy: apiKeys.createdBy,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt)),
  );
}

/**
 * Revoke a key. Immediate, and there is no un-revoke.
 *
 * Returns whether anything changed, so a caller can tell "revoked" from
 * "already revoked" or "not yours" — the last two are indistinguishable on
 * purpose, since RLS makes another tenant's key simply absent.
 */
export async function revokeApiKey(
  db: Database,
  context: TenantContext,
  id: string,
): Promise<boolean> {
  return withTenant(db, context, async (tx) => {
    const revoked = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    return revoked.length > 0;
  });
}
