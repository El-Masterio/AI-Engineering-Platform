// @vitest-environment node
//
// Node rather than the suite-wide jsdom: this file reaches @atelier/db, whose
// migration runner resolves a directory from import.meta.url at module load.
// Under jsdom that is not a file URL and the import dies with "The URL must be
// of scheme file" - an environment mismatch presenting as a broken package.
import { describe, expect, it } from "vitest";
import { createAuth, type CreateAuthOptions } from "./auth.js";

/**
 * The security-relevant configuration, asserted without a database.
 *
 * `auth.integration.test.ts` proves the flows work end to end, but it needs a
 * container and so it is not what runs on every commit. These claims — cookie
 * flags, password floor, which endpoints are throttled, whether a provider is
 * wired — are the ones most likely to be quietly changed by someone tuning
 * something adjacent, and they are all readable off the constructed options.
 *
 * Nothing here mocks Better Auth. It builds the real instance and inspects what
 * it was actually configured with.
 */

const base: CreateAuthOptions = {
  database: {},
  secret: "a-test-secret-that-is-comfortably-long-enough",
  baseUrl: "https://atelier.example",
  email: { send: () => Promise.resolve() },
  emailFrom: "Atelier <noreply@atelier.example>",
};

const optionsOf = (overrides: Partial<CreateAuthOptions> = {}) =>
  createAuth({ ...base, ...overrides }).options;

describe("session cookies (FR-AUTH-3)", () => {
  it("are httpOnly and SameSite=Lax", () => {
    const attributes = optionsOf().advanced?.defaultCookieAttributes;
    expect(attributes?.httpOnly).toBe(true);
    // Lax and not Strict: Strict drops the cookie on the OAuth callback
    // redirect, so sign-in with GitHub completes and lands logged out.
    expect(attributes?.sameSite).toBe("lax");
  });

  it("are Secure over https", () => {
    expect(optionsOf().advanced?.defaultCookieAttributes?.secure).toBe(true);
    expect(optionsOf().advanced?.useSecureCookies).toBe(true);
  });

  it("are NOT Secure over plain http", () => {
    // A Secure cookie on http is dropped by the browser, and the symptom is
    // "login silently does nothing" on localhost.
    const local = optionsOf({ baseUrl: "http://localhost:3001" });
    expect(local.advanced?.defaultCookieAttributes?.secure).toBe(false);
    expect(local.advanced?.useSecureCookies).toBe(false);
  });
});

describe("primary keys", () => {
  it("are UUIDs, matching the schema", () => {
    // Better Auth generates short strings by default; §15 says uuid. Without
    // this every insert fails with FAILED_TO_CREATE_USER and the library
    // reports its own error rather than the driver's.
    const generated = optionsOf().advanced?.database?.generateId?.();
    expect(generated).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
  });
});

describe("passwords (FR-AUTH-1)", () => {
  it("use our Argon2id functions rather than the library default", () => {
    // The default is scrypt. A missing override here is invisible until
    // someone reads a hash out of the database.
    const password = optionsOf().emailAndPassword?.password;
    expect(password?.hash).toBeTypeOf("function");
    expect(password?.verify).toBeTypeOf("function");
  });

  it("require at least 12 characters", () => {
    expect(optionsOf().emailAndPassword?.minPasswordLength).toBe(12);
  });

  it("do not block sign-in on unverified email", () => {
    // FR-AUTH-4 gates AGENT RUNS, not login. Blocking sign-in would strand a
    // user who mistyped their address at signup.
    expect(optionsOf().emailAndPassword?.requireEmailVerification).toBe(false);
  });

  it("revoke every session on reset (FR-AUTH-5)", () => {
    // A reset usually means someone else may have the old password.
    expect(optionsOf().emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("expire reset tokens in an hour", () => {
    expect(optionsOf().emailAndPassword?.resetPasswordTokenExpiresIn).toBe(3600);
  });
});

describe("rate limiting", () => {
  it("is on by default", () => {
    expect(optionsOf().rateLimit?.enabled).toBe(true);
  });

  it("can be switched off only deliberately", () => {
    expect(optionsOf({ rateLimitEnabled: false }).rateLimit?.enabled).toBe(false);
  });

  it("throttles every credential-guessing endpoint, not just sign-in", () => {
    const rules = Object.keys(optionsOf().rateLimit?.customRules ?? {});
    expect(rules).toEqual(
      expect.arrayContaining([
        "/sign-in/email",
        "/sign-up/email",
        "/request-password-reset",
        "/reset-password",
      ]),
    );
  });

  it("limits sign-in far below the global allowance", () => {
    // A global limit generous enough for normal browsing is far too generous
    // for password guessing.
    const rateLimit = optionsOf().rateLimit;
    const signIn = rateLimit?.customRules?.["/sign-in/email"];
    expect(typeof signIn === "object" ? signIn.max : undefined).toBeLessThan(
      rateLimit?.max ?? Infinity,
    );
  });
});

describe("OAuth (FR-AUTH-2)", () => {
  const github = { clientId: "gh-id", clientSecret: "gh-secret" };
  const google = { clientId: "goog-id", clientSecret: "goog-secret" };

  it("configures no provider when none is supplied", () => {
    // A developer without OAuth apps gets a working email/password build
    // rather than a boot failure.
    expect(Object.keys(optionsOf().socialProviders ?? {})).toHaveLength(0);
  });

  it("configures only the providers supplied", () => {
    expect(Object.keys(optionsOf({ github }).socialProviders ?? {})).toEqual(["github"]);
    expect(
      Object.keys(optionsOf({ github, google }).socialProviders ?? {}).toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toEqual(["github", "google"]);
  });
});

describe("email verification (FR-AUTH-4)", () => {
  it("sends on sign-up and expires in an hour", () => {
    expect(optionsOf().emailVerification?.sendOnSignUp).toBe(true);
    expect(optionsOf().emailVerification?.expiresIn).toBe(3600);
  });

  it("routes verification mail through the injected port", async () => {
    // The port is what keeps the provider one file to replace (ADR-011).
    const sent: { to: string; subject: string }[] = [];
    const auth = createAuth({
      ...base,
      email: {
        send: (message) => {
          sent.push({ to: message.to, subject: message.subject });
          return Promise.resolve();
        },
      },
    });

    await auth.options.emailVerification?.sendVerificationEmail?.({
      user: { id: "u1", email: "ada@example.test" },
      url: "https://atelier.example/verify?token=abc",
      token: "abc",
    } as never);

    expect(sent[0]?.to).toBe("ada@example.test");
    expect(sent[0]?.subject).toContain("Verify");
  });

  it("routes reset mail through the same port, carrying the link", async () => {
    const sent: string[] = [];
    const auth = createAuth({
      ...base,
      email: {
        send: (message) => {
          sent.push(message.text);
          return Promise.resolve();
        },
      },
    });

    await auth.options.emailAndPassword?.sendResetPassword?.({
      user: { id: "u1", email: "ada@example.test" },
      url: "https://atelier.example/api/auth/reset-password/tok",
      token: "tok",
    } as never);

    expect(sent[0]).toContain("https://atelier.example/api/auth/reset-password/tok");
  });
});

describe("sessions", () => {
  it("live in the database, which is what makes revocation server-side", () => {
    expect(optionsOf().session?.modelName).toBe("sessions");
    expect(optionsOf().session?.expiresIn).toBe(604_800);
  });

  it("maps onto our plural table names", () => {
    const options = optionsOf();
    expect(options.user?.modelName).toBe("users");
    expect(options.account?.modelName).toBe("accounts");
    expect(options.verification?.modelName).toBe("verifications");
  });

  it("maps the credential column to the name that says what it holds", () => {
    expect(optionsOf().account?.fields?.password).toBe("passwordHash");
  });
});
