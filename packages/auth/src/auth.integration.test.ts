import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { createConsoleEmailAdapter, type ConsoleEmailAdapter } from "@atelier/email";
import { migrateUp } from "@atelier/db";
import { createAuth, type Auth } from "./auth.js";

/**
 * M014 acceptance, against a real database.
 *
 * Everything here could have been unit-tested with a mocked adapter, and that
 * would have proved nothing worth knowing. The configuration in auth.ts maps
 * Better Auth's core models onto a schema that predates it — plural table
 * names, `passwordHash` instead of `password`, `avatarUrl` instead of `image`,
 * and an `emailVerified` boolean kept in step with a timestamp by a trigger.
 * Every one of those mappings is a claim about names, and a mock would agree
 * with whatever names were written.
 *
 * So: real Postgres, real migrations, real sign-up and sign-in.
 */

let container: StartedPostgreSqlContainer;
let sql: Sql;
let auth: Auth;
let email: ConsoleEmailAdapter;

const BASE_URL = "http://localhost:3001";

/** Remove addresses so two responses can be compared for shape, not content. */
function strip(body: string): string {
  return body.replaceAll(/"[^"]*@[^"]*"/g, '"redacted"');
}

/** Call an auth endpoint the way a browser would. */
function api(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  sql = postgres(container.getConnectionUri(), { max: 4, prepare: false });
  await migrateUp(sql);

  email = createConsoleEmailAdapter();
  auth = createAuth({
    database: drizzle(sql),
    secret: "test-secret-not-a-real-one-but-long-enough-to-sign",
    baseUrl: BASE_URL,
    email,
    emailFrom: "Atelier <noreply@example.test>",
    trustedOrigins: [BASE_URL],
    // Off here so the limits do not throttle the suite. Rate limiting has its
    // own instance and its own describe block below, where it is the subject
    // rather than an obstacle.
    rateLimitEnabled: false,
  });
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await container?.stop();
}, 60_000);

describe("sign-up (FR-AUTH-1)", () => {
  it("creates a user and stores an ARGON2ID hash", async () => {
    const response = await api("/sign-up/email", {
      email: "ada@example.test",
      password: "correct-horse-battery-staple",
      name: "Ada Lovelace",
    });
    expect(response.status, await response.clone().text()).toBe(200);

    // Read the credential straight out of the database rather than trusting
    // the response. The requirement is about what is STORED.
    const [account] = await sql<{ password_hash: string | null }[]>`
      SELECT a.password_hash FROM accounts a
      JOIN users u ON u.id = a.user_id
      WHERE lower(u.email) = 'ada@example.test' AND a.provider_id = 'credential'
    `;
    expect(account?.password_hash?.startsWith("$argon2id$")).toBe(true);
  });

  it("wrote through the field mapping onto our column names", async () => {
    // If `passwordHash` had been mapped wrongly the row above would exist with
    // a null hash, and sign-in would fail for a reason nobody could see.
    const [row] = await sql<{ email: string; name: string | null }[]>`
      SELECT email, name FROM users WHERE lower(email) = 'ada@example.test'
    `;
    expect(row?.name).toBe("Ada Lovelace");
  });

  it("starts unverified, in BOTH columns (migration 0003)", async () => {
    const [row] = await sql<{ email_verified: boolean; email_verified_at: Date | null }[]>`
      SELECT email_verified, email_verified_at FROM users WHERE lower(email) = 'ada@example.test'
    `;
    expect(row?.email_verified).toBe(false);
    expect(row?.email_verified_at).toBeNull();
  });

  it("sends a verification email carrying a link (FR-AUTH-4)", () => {
    expect(email.last?.to).toBe("ada@example.test");
    expect(email.last?.text).toContain(`${BASE_URL}/api/auth/verify-email`);
  });

  it("refuses a password under the minimum length", async () => {
    const response = await api("/sign-up/email", {
      email: "short@example.test",
      password: "short",
      name: "Too Short",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("sign-in (FR-AUTH-3)", () => {
  it("accepts the right password and sets a session cookie", async () => {
    const response = await api("/sign-in/email", {
      email: "ada@example.test",
      password: "correct-horse-battery-staple",
    });
    expect(response.status, await response.clone().text()).toBe(200);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("does NOT mark the cookie Secure over plain http", async () => {
    // A Secure cookie on http is dropped by the browser, and the symptom is
    // "login silently does nothing" on localhost.
    const response = await api("/sign-in/email", {
      email: "ada@example.test",
      password: "correct-horse-battery-staple",
    });
    expect(response.headers.get("set-cookie") ?? "").not.toContain("Secure");
  });

  it("persists the session server-side, so it can be revoked (FR-AUTH-3)", async () => {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*)::text FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE lower(u.email) = 'ada@example.test'
    `;
    expect(Number(row?.count ?? 0)).toBeGreaterThan(0);
  });

  it("rejects the wrong password", async () => {
    const response = await api("/sign-in/email", {
      email: "ada@example.test",
      password: "not-the-password-at-all",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("gives the SAME answer for a wrong password and an unknown account", async () => {
    // §17: "generic failure messages". Distinguishable responses turn the
    // login form into an account-enumeration oracle.
    const wrongPassword = await api("/sign-in/email", {
      email: "ada@example.test",
      password: "not-the-password-at-all",
    });
    const noSuchUser = await api("/sign-in/email", {
      email: "nobody@example.test",
      password: "not-the-password-at-all",
    });

    expect(noSuchUser.status).toBe(wrongPassword.status);

    expect(strip(await noSuchUser.text())).toBe(strip(await wrongPassword.text()));
  });
});

describe("email verification (FR-AUTH-4)", () => {
  it("flips both columns when the emailed link is followed", async () => {
    email.clear();
    await api("/sign-up/email", {
      email: "grace@example.test",
      password: "another-long-enough-password",
      name: "Grace",
    });

    const link = /https?:\/\/\S+/.exec(email.last?.text ?? "")?.[0];
    expect(link, "no verification link was emailed").toBeDefined();

    const verified = await auth.handler(new Request(link as string));
    expect(verified.status).toBeLessThan(400);

    const [row] = await sql<{ email_verified: boolean; email_verified_at: Date | null }[]>`
      SELECT email_verified, email_verified_at FROM users WHERE lower(email) = 'grace@example.test'
    `;
    // The trigger from 0003 is what keeps these two in step; the library only
    // ever writes the boolean.
    expect(row?.email_verified).toBe(true);
    expect(row?.email_verified_at).not.toBeNull();
  });
});

describe("password reset (FR-AUTH-5)", () => {
  it("emails a link and revokes existing sessions when used", async () => {
    email.clear();
    await api("/request-password-reset", {
      email: "ada@example.test",
      redirectTo: `${BASE_URL}/reset`,
    });

    // The token is a PATH segment, not a query parameter:
    //   /api/auth/reset-password/<token>?callbackURL=...
    const token = /reset-password\/([^?\s]+)/.exec(email.last?.text ?? "")?.[1];
    expect(token, "no reset token was emailed").toBeDefined();

    const before = await sql<{ count: string }[]>`
      SELECT count(*)::text FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE lower(u.email) = 'ada@example.test' AND s.revoked_at IS NULL
    `;
    expect(Number(before[0]?.count ?? 0)).toBeGreaterThan(0);

    const reset = await api("/reset-password", {
      newPassword: "a-brand-new-long-password",
      token,
    });
    expect(reset.status, await reset.clone().text()).toBe(200);

    // FR-AUTH-5's revocable half: a reset usually means someone else may have
    // the old password, so their sessions must not survive it.
    const [after] = await sql<{ count: string }[]>`
      SELECT count(*)::text FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE lower(u.email) = 'ada@example.test'
    `;
    expect(Number(after?.count ?? 0)).toBe(0);
  });

  it("answers identically for an unknown address (§17 enumeration)", async () => {
    // "If this email exists in our system…" — the same response either way, so
    // the reset form cannot be used to test whether an account exists.
    const known = await api("/request-password-reset", {
      email: "grace@example.test",
      redirectTo: `${BASE_URL}/reset`,
    });
    const unknown = await api("/request-password-reset", {
      email: "nobody-at-all@example.test",
      redirectTo: `${BASE_URL}/reset`,
    });

    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
  });

  it("refuses to reuse a consumed token (single use)", async () => {
    email.clear();
    await api("/request-password-reset", {
      email: "grace@example.test",
      redirectTo: `${BASE_URL}/reset`,
    });
    const token = /reset-password\/([^?\s]+)/.exec(email.last?.text ?? "")?.[1];

    const first = await api("/reset-password", { newPassword: "first-new-password-x", token });
    expect(first.status, await first.clone().text()).toBe(200);

    const second = await api("/reset-password", { newPassword: "second-new-password-x", token });
    expect(second.status, "a reset token was accepted twice").toBeGreaterThanOrEqual(400);
  });

  it("lets the user sign in with the new password and not the old one", async () => {
    const withNew = await api("/sign-in/email", {
      email: "ada@example.test",
      password: "a-brand-new-long-password",
    });
    expect(withNew.status).toBe(200);

    const withOld = await api("/sign-in/email", {
      email: "ada@example.test",
      password: "correct-horse-battery-staple",
    });
    expect(withOld.status).toBeGreaterThanOrEqual(400);
  });
});

describe("login rate limiting", () => {
  /**
   * A separate instance, because the limits that protect a login form also
   * throttle a suite that signs in twenty times in three seconds — so the main
   * instance above has them off. That makes this block the ONLY evidence the
   * control works, which is exactly why it asserts the boundary from both
   * sides: allowed below the limit, refused above it.
   */
  let limited: Auth;

  beforeAll(() => {
    limited = createAuth({
      database: drizzle(sql),
      secret: "test-secret-not-a-real-one-but-long-enough-to-sign",
      baseUrl: BASE_URL,
      email,
      emailFrom: "Atelier <noreply@example.test>",
      trustedOrigins: [BASE_URL],
      rateLimitEnabled: true,
    });
  });

  async function attempt(address: string): Promise<number> {
    const response = await limited.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({ email: address, password: "wrong-password-entirely" }),
      }),
    );
    return response.status;
  }

  it("allows the first attempts and then refuses with 429", async () => {
    // Both halves of ONE observed sequence, deliberately.
    //
    // Splitting them into two tests looked tidier and was wrong: the limiter
    // keys on client identity, so the second test inherited the first's
    // exhausted counter and saw 429 from its opening attempt. Asserting both
    // properties of a single sequence removes the coupling instead of hiding
    // it behind a reset.
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push(await attempt("target@example.test"));

    const seen = `saw: ${statuses.join(",")}`;
    // A limiter that rejected everything would satisfy the second assertion
    // alone. This is the half that proves it is a limit and not a wall.
    expect(statuses[0], seen).not.toBe(429);
    expect(statuses, seen).toContain(429);
  });
});
