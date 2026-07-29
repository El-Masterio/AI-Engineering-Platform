import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startHarness,
  seedOrganization,
  seedUserWithMembership,
  type Harness,
} from "./testing/harness.js";

/**
 * ADR-010's boundary, asserted from both sides.
 *
 * The decision widened the security boundary on purpose: `atelier_auth` reads
 * identity without a tenant filter, because sign-in has no tenant. A test that
 * only proved *that* would be worthless — it would pass identically if the role
 * were a superuser, which is precisely the failure the M004 harness exists to
 * prevent.
 *
 * So the primary assertions here are NEGATIVE:
 *
 *   atelier_auth  →  organizations, memberships   must be DENIED
 *   atelier_app   →  accounts (password hashes)   must be DENIED
 *
 * The blast radius of each role is the claim ADR-010 makes, and this file is
 * what makes the claim checkable rather than aspirational.
 */

let h: Harness;

const ORG_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_A = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_A = "44444444-4444-4444-8444-444444444444";
const SESSION_A = "55555555-5555-4555-8555-555555555555";

/** Postgres raises 42501 for insufficient_privilege. */
async function captureRejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

async function expectPermissionDenied(run: () => Promise<unknown>, what: string): Promise<void> {
  const error = await captureRejection(run);

  expect(
    error,
    `${what} was ALLOWED — the blast radius is wider than ADR-010 claims`,
  ).toBeDefined();
  expect((error as { code?: string }).code, `${what} failed for the wrong reason`).toBe("42501");
}

beforeAll(async () => {
  h = await startHarness();

  await seedOrganization(h.owner, { id: ORG_A, slug: "acme" });
  await seedUserWithMembership(h.owner, {
    userId: USER_A,
    email: "ada@example.test",
    organizationId: ORG_A,
    membershipId: MEMBERSHIP_A,
  });

  await h.owner`
    INSERT INTO accounts (id, user_id, provider_id, account_id, password_hash)
    VALUES (${ACCOUNT_A}, ${USER_A}, 'credential', ${USER_A}, '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$hash')
  `;
  await h.owner`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (${SESSION_A}, ${USER_A}, 'session-token-a', now() + interval '7 days')
  `;
}, 180_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

describe("atelier_auth cannot reach tenant data — the blast radius ADR-010 claims", () => {
  it("is DENIED organizations", async () => {
    await expectPermissionDenied(
      () => h.auth`SELECT id FROM organizations`,
      "auth → organizations",
    );
  });

  it("is DENIED memberships", async () => {
    await expectPermissionDenied(() => h.auth`SELECT id FROM memberships`, "auth → memberships");
  });

  it("is DENIED writing an organization", async () => {
    // Read denial without write denial would still let a compromised auth
    // credential create a tenant and invite itself into it.
    await expectPermissionDenied(
      () =>
        h.auth`INSERT INTO organizations (id, slug, name) VALUES (gen_random_uuid(), 'evil', 'evil')`,
      "auth → INSERT organizations",
    );
  });

  it("is not a superuser, which is what would make every assertion above vacuous", async () => {
    const [role] = await h.auth<{ is_superuser: boolean }[]>`
      SELECT rolsuper AS is_superuser FROM pg_roles WHERE rolname = current_user
    `;
    expect(role?.is_superuser).toBe(false);
  });
});

describe("atelier_app cannot reach credentials", () => {
  it("is DENIED accounts, so a password hash is unreachable from the request-serving role", async () => {
    // By privilege, not by policy: `accounts` carries no grant for atelier_app
    // at all, so this cannot be undone by getting a policy subtly wrong.
    await expectPermissionDenied(() => h.app`SELECT password_hash FROM accounts`, "app → accounts");
  });

  it("is DENIED writing an account", async () => {
    await expectPermissionDenied(
      () =>
        h.app`INSERT INTO accounts (id, user_id, provider_id, account_id) VALUES (gen_random_uuid(), ${USER_A}, 'credential', 'x')`,
      "app → INSERT accounts",
    );
  });

  it("keeps its M004 tenant scoping on users exactly as it was", async () => {
    // The role-scoped policy added for atelier_auth is filtered BY ROLE, so it
    // must be invisible here. With no tenant claim set, app sees nothing.
    const rows = await h.app<{ id: string }[]>`SELECT id FROM users`;
    expect(rows).toHaveLength(0);
  });
});

describe("atelier_auth can do the one thing sign-in requires", () => {
  it("finds a user by email with NO tenant context set", async () => {
    // The whole reason ADR-010 exists. Under the M004 policies alone this
    // returns zero rows, and the application reports "no such user" for every
    // user in the database.
    const rows = await h.auth<{ id: string }[]>`
      SELECT id FROM users WHERE lower(email) = 'ada@example.test'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(USER_A);
  });

  it("reads the credential it must verify", async () => {
    const rows = await h.auth<{ password_hash: string | null }[]>`
      SELECT password_hash FROM accounts WHERE user_id = ${USER_A} AND provider_id = 'credential'
    `;
    expect(rows[0]?.password_hash).toContain("$argon2id$");
  });

  it("creates and revokes a session", async () => {
    const id = "66666666-6666-4666-8666-666666666666";
    await h.auth`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (${id}, ${USER_A}, 'token-b', now() + interval '1 day')
    `;
    await h.auth`UPDATE sessions SET revoked_at = now() WHERE id = ${id}`;

    const [row] = await h.auth<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM sessions WHERE id = ${id}
    `;
    // FR-AUTH-3: revocation is server-side and takes effect immediately.
    expect(row?.revoked_at).not.toBeNull();
  });
});

describe("atelier_app cannot reach sessions either", () => {
  /**
   * The first draft of the migration granted `atelier_app` SELECT on sessions
   * "so it can identify the caller". This suite is what showed that to be the
   * wrong boundary: validating a session is authentication's job, and the app
   * layer needs only an already-validated user id to resolve tenancy from
   * `memberships`, which it owns.
   *
   * It also did not work — the grant was there but no policy admitted the role,
   * so RLS returned zero rows and the symptom looked like a missing session
   * rather than a missing policy. Both reasons point the same way.
   */
  it("is DENIED reading a session", async () => {
    await expectPermissionDenied(
      () => h.app`SELECT user_id FROM sessions WHERE token = 'session-token-a'`,
      "app → SELECT sessions",
    );
  });

  it("is DENIED deleting a session, because revocation is auth's job", async () => {
    await expectPermissionDenied(
      () => h.app`DELETE FROM sessions WHERE id = ${SESSION_A}`,
      "app → DELETE sessions",
    );
  });
});

describe("the credential constraint holds", () => {
  it("refuses a password hash on an OAuth account", async () => {
    // "It is null for OAuth" is otherwise a convention, and conventions rot.
    const error = await captureRejection(
      () => h.auth`
        INSERT INTO accounts (id, user_id, provider_id, account_id, password_hash)
        VALUES (gen_random_uuid(), ${USER_A}, 'github', 'gh-1', 'should-not-be-here')
      `,
    );

    expect(error).toBeDefined();
    expect((error as { constraint_name?: string }).constraint_name).toBe(
      "chk_accounts_password_only_for_credential",
    );
  });

  it("allows an OAuth account with no password hash", async () => {
    await expect(
      h.auth`
        INSERT INTO accounts (id, user_id, provider_id, account_id)
        VALUES (gen_random_uuid(), ${USER_A}, 'google', 'goog-1')
      `,
    ).resolves.toBeDefined();
  });
});

describe("a session token is not the session id", () => {
  it("stores them as different values", async () => {
    // Leaking an id in a URL or a log must not leak a credential.
    const [row] = await h.auth<{ id: string; token: string }[]>`
      SELECT id, token FROM sessions WHERE id = ${SESSION_A}
    `;
    expect(row?.token).not.toBe(row?.id);
  });

  it("enforces token uniqueness", async () => {
    const error = await captureRejection(
      () => h.auth`
        INSERT INTO sessions (id, user_id, token, expires_at)
        VALUES (gen_random_uuid(), ${USER_A}, 'session-token-a', now() + interval '1 day')
      `,
    );
    expect((error as { code?: string }).code).toBe("23505");
  });
});
