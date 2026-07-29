import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isMatchingSecret,
  issueApiKey,
  listApiKeys,
  resolveApiKey,
  revokeApiKey,
} from "./api-keys.js";
import { provisionPersonalOrganization } from "./tenancy.js";
import { createTenantContext, type TenantContext } from "./tenant-context.js";
import { startHarness, type Harness } from "./testing/harness.js";

/**
 * §16's API keys, M019's acceptance: shown once only · scopes enforced by the
 * policy engine · revocation immediate · usage audited.
 *
 * The assertions that matter are about what CANNOT be done: recover a key,
 * use a revoked one, use another tenant's, or tell apart the several ways a
 * key can be invalid.
 */

let h: Harness;
let context: TenantContext;
let other: TenantContext;
let userId: string;
let otherUserId: string;

async function makeTenant(email: string): Promise<{ context: TenantContext; userId: string }> {
  const id = crypto.randomUUID();
  await h.owner`INSERT INTO users (id, email) VALUES (${id}, ${email})`;
  const org = await provisionPersonalOrganization(h.appDb, { userId: id, email });
  return { context: createTenantContext(org.organizationId), userId: id };
}

beforeAll(async () => {
  h = await startHarness();
  const primary = await makeTenant("keys@example.test");
  context = primary.context;
  userId = primary.userId;
  const secondary = await makeTenant("keys-other@example.test");
  other = secondary.context;
  otherUserId = secondary.userId;
}, 180_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

describe("issuing", () => {
  it("returns the secret ONCE and stores only a hash", async () => {
    const issued = await issueApiKey(h.appDb, context, {
      name: "ci",
      createdBy: userId,
      scopes: ["projects:read"],
    });

    expect(issued.secret.startsWith("atl_")).toBe(true);

    // The acceptance criterion. Nothing anywhere holds the plaintext.
    const [row] = await h.owner<{ key_hash: string; prefix: string }[]>`
      SELECT key_hash, prefix FROM api_keys WHERE id = ${issued.record.id}
    `;
    expect(row?.key_hash, "the plaintext key was stored").not.toBe(issued.secret);
    expect(row?.key_hash).toMatch(/^[\da-f]{64}$/);

    // And the whole table cannot be searched for it either.
    const [match] = await h.owner<{ count: string }[]>`
      SELECT count(*)::text FROM api_keys WHERE key_hash = ${issued.secret}
    `;
    expect(match?.count).toBe("0");
  });

  it("exposes a prefix that identifies the key without being usable", async () => {
    const issued = await issueApiKey(h.appDb, context, {
      name: "prefix",
      createdBy: userId,
      scopes: [],
    });

    expect(issued.record.prefix.startsWith("atl_")).toBe(true);
    expect(issued.secret.startsWith(issued.record.prefix)).toBe(true);
    // Short enough to be useless: the prefix alone must not authenticate.
    expect(await resolveApiKey(h.appDb, issued.record.prefix)).toBeUndefined();
  });

  it("gives two keys different secrets", async () => {
    const a = await issueApiKey(h.appDb, context, { name: "a", createdBy: userId, scopes: [] });
    const b = await issueApiKey(h.appDb, context, { name: "b", createdBy: userId, scopes: [] });
    expect(a.secret).not.toBe(b.secret);
  });
});

describe("resolving", () => {
  it("returns the principal for a live key", async () => {
    const issued = await issueApiKey(h.appDb, context, {
      name: "live",
      createdBy: userId,
      scopes: ["projects:read", "runs:read"],
    });

    const resolved = await resolveApiKey(h.appDb, `Bearer ${issued.secret}`);
    expect(resolved?.organizationId).toBe(context.organizationId);
    expect(resolved?.userId).toBe(userId);
    expect(resolved?.scopes).toEqual(["projects:read", "runs:read"]);
  });

  it("accepts the raw value as well as a Bearer prefix", async () => {
    const issued = await issueApiKey(h.appDb, context, {
      name: "raw",
      createdBy: userId,
      scopes: [],
    });
    expect(await resolveApiKey(h.appDb, issued.secret)).toBeDefined();
  });

  it("gives ONE answer for every kind of invalid key", async () => {
    // Distinguishing "unknown" from "revoked" from "expired" tells an attacker
    // which of their guesses was once real.
    const revoked = await issueApiKey(h.appDb, context, {
      name: "revoked",
      createdBy: userId,
      scopes: [],
    });
    await revokeApiKey(h.appDb, context, revoked.record.id);

    const expired = await issueApiKey(h.appDb, context, {
      name: "expired",
      createdBy: userId,
      scopes: [],
      expiresAt: new Date(Date.now() - 1000),
    });

    for (const candidate of [
      undefined,
      "",
      "not-a-key",
      "Bearer wrong_prefix_abcdef",
      "atl_completely-made-up-value-that-is-long-enough",
      revoked.secret,
      expired.secret,
    ]) {
      expect(
        await resolveApiKey(h.appDb, candidate),
        `${String(candidate).slice(0, 20)} resolved`,
      ).toBeUndefined();
    }
  });

  it("records usage (M019 acceptance: usage audited)", async () => {
    const issued = await issueApiKey(h.appDb, context, {
      name: "used",
      createdBy: userId,
      scopes: [],
    });

    const [before] = await h.owner<{ last_used_at: Date | null }[]>`
      SELECT last_used_at FROM api_keys WHERE id = ${issued.record.id}
    `;
    expect(before?.last_used_at).toBeNull();

    await resolveApiKey(h.appDb, issued.secret);

    const [after] = await h.owner<{ last_used_at: Date | null }[]>`
      SELECT last_used_at FROM api_keys WHERE id = ${issued.record.id}
    `;
    expect(after?.last_used_at).not.toBeNull();
  });
});

describe("revocation is immediate", () => {
  it("stops working on the very next call", async () => {
    const issued = await issueApiKey(h.appDb, context, {
      name: "doomed",
      createdBy: userId,
      scopes: [],
    });
    expect(await resolveApiKey(h.appDb, issued.secret)).toBeDefined();

    expect(await revokeApiKey(h.appDb, context, issued.record.id)).toBe(true);

    // No cache to expire, no grace period: the next request is refused.
    expect(await resolveApiKey(h.appDb, issued.secret)).toBeUndefined();
  });

  it("reports that a second revoke changed nothing", async () => {
    const issued = await issueApiKey(h.appDb, context, {
      name: "twice",
      createdBy: userId,
      scopes: [],
    });
    expect(await revokeApiKey(h.appDb, context, issued.record.id)).toBe(true);
    expect(await revokeApiKey(h.appDb, context, issued.record.id)).toBe(false);
  });

  it("cannot revoke another tenant's key", async () => {
    const theirs = await issueApiKey(h.appDb, other, {
      name: "theirs",
      createdBy: otherUserId,
      scopes: [],
    });

    // RLS makes it simply absent, so this is indistinguishable from "not found"
    // — which is exactly what §16 wants.
    expect(await revokeApiKey(h.appDb, context, theirs.record.id)).toBe(false);
    expect(await resolveApiKey(h.appDb, theirs.secret), "the key was revoked").toBeDefined();
  });
});

describe("listing is tenant-scoped and never exposes a secret", () => {
  it("shows only this tenant's keys", async () => {
    const mine = await listApiKeys(h.appDb, context);
    const theirs = await listApiKeys(h.appDb, other);

    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.every((k) => mine.every((m) => m.id !== k.id))).toBe(true);
  });

  it("returns no field that could be used to authenticate", async () => {
    // The prefix DOES appear and starts with `atl_` — §16 wants it visible so
    // two keys can be told apart. So the assertion is not "no atl_ anywhere",
    // which would contradict the design; it is that nothing listed can be used
    // as a credential.
    const issued = await issueApiKey(h.appDb, context, {
      name: "listed",
      createdBy: userId,
      scopes: [],
    });
    const listed = await listApiKeys(h.appDb, context);
    const mine = listed.find((k) => k.id === issued.record.id);

    expect(Object.keys(mine ?? {})).not.toContain("keyHash");
    expect(JSON.stringify(listed)).not.toContain(issued.secret);

    // Every exposed prefix is far too short to authenticate with.
    for (const key of listed) {
      expect(
        await resolveApiKey(h.appDb, key.prefix),
        `${key.prefix} authenticated`,
      ).toBeUndefined();
    }
  });
});

describe("isMatchingSecret", () => {
  it("compares equal and unequal values", () => {
    expect(isMatchingSecret("atl_abc", "atl_abc")).toBe(true);
    expect(isMatchingSecret("atl_abc", "atl_abd")).toBe(false);
  });

  it("does not throw on differing lengths", () => {
    // timingSafeEqual throws on a length mismatch, which is itself a leak.
    expect(isMatchingSecret("short", "much-longer-value")).toBe(false);
  });
});
