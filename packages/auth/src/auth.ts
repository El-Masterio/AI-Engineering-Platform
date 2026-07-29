import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { accounts, sessions, users, verifications } from "@atelier/db";
import type { EmailPort } from "@atelier/domain";
import { hashPassword, verifyPassword } from "./password.js";

/**
 * Better Auth, configured against the identity boundary from ADR-010.
 *
 * The database handle passed in MUST be built on the `atelier_auth` connection.
 * Nothing here can check that — a Drizzle instance does not know which role it
 * authenticated as — so it is stated at the one call site in `apps/api` and
 * proved by `packages/db/src/auth-isolation.integration.test.ts`, which asserts
 * what each role can and cannot reach.
 *
 * Three things are configured against a library default rather than with it,
 * and each one is a requirement rather than a preference:
 *
 *   FR-AUTH-1  Argon2id. The default is scrypt.
 *   FR-AUTH-3  httpOnly + Secure + SameSite=Lax, server-side revocable.
 *   FR-AUTH-5  Reset tokens single-use, time-limited, and revoking sessions.
 */

export type CreateAuthOptions = {
  /** Drizzle handle on the `atelier_auth` connection (ADR-010). */
  readonly database: Parameters<typeof drizzleAdapter>[0];
  /** Signing secret. `BETTER_AUTH_SECRET` — a §17 secret, never logged. */
  readonly secret: string;
  /** Public origin, e.g. `https://api-production-9f7c.up.railway.app`. */
  readonly baseUrl: string;
  /** Where verification and reset mail goes (ADR-011). */
  readonly email: EmailPort;
  /** From address for those messages. */
  readonly emailFrom: string;
  /** Browser origins allowed to drive auth. CSRF depends on this being tight. */
  readonly trustedOrigins?: readonly string[];
  readonly github?: { clientId: string; clientSecret: string };
  readonly google?: { clientId: string; clientSecret: string };
  /**
   * Shared store for rate-limit counters.
   *
   * Omitted means in-memory, which is correct for one replica and WRONG for
   * several: each process would keep its own counter, so N replicas multiply
   * the effective login attempt limit by N. Staging runs a single replica
   * (ADR-009); this must be supplied before that stops being true.
   */
  readonly secondaryStorage?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttl?: number) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  /**
   * Rate limiting, on unless explicitly disabled.
   *
   * Configurable because the limits that protect a login form also throttle a
   * test suite that signs in twenty times in three seconds. Defaulting to ON
   * means switching it off is a deliberate act at a call site, not something
   * that happens by forgetting.
   */
  readonly rateLimitEnabled?: boolean;
};

/** Seconds. */
const ONE_HOUR = 3600;
const ONE_WEEK = 604_800;
const ONE_DAY = 86_400;

export function createAuth(options: CreateAuthOptions) {
  const isSecure = options.baseUrl.startsWith("https://");

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    trustedOrigins: [...(options.trustedOrigins ?? [])],

    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
    }),

    // ── Model mapping ────────────────────────────────────────────────────
    // Better Auth's core models are singular (`user`, `session`); ours are
    // plural because §15 says tables are plural. Field names are remapped
    // where our column predates the library.
    user: {
      modelName: "users",
      fields: {
        // Ours is `avatar_url`; the library calls it `image`.
        image: "avatarUrl",
      },
    },
    session: {
      modelName: "sessions",
      // FR-AUTH-3: revocation is server-side, which is why sessions are rows.
      expiresIn: ONE_WEEK,
      updateAge: ONE_DAY,
    },
    account: {
      modelName: "accounts",
      fields: {
        // Ours says what it holds. The library just says `password`, which is
        // the kind of name that ends up in a log line next to its value.
        password: "passwordHash",
      },
    },
    verification: { modelName: "verifications" },

    // ── Email + password ─────────────────────────────────────────────────
    emailAndPassword: {
      enabled: true,
      // FR-AUTH-1. Not the default.
      password: { hash: hashPassword, verify: verifyPassword },
      // Above the library's 8. Length is the only password rule that reliably
      // helps; composition rules push people toward `Password1!`.
      minPasswordLength: 12,
      /**
       * FR-AUTH-4 gates AGENT RUNS on verification, not login.
       *
       * Blocking sign-in would be a stricter reading than the requirement, and
       * a worse product: a user who mistypes their address at signup could
       * never get back in to correct it. The gate belongs at the run boundary,
       * where M0xx enforces it against `users.email_verified_at`.
       */
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: ONE_HOUR,
      /**
       * FR-AUTH-5's "revocable" half.
       *
       * Resetting a password almost always means "someone else may have it".
       * Leaving existing sessions alive would let the attacker keep the access
       * the reset was performed to remove.
       */
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await options.email.send({
          to: user.email,
          subject: "Reset your Atelier password",
          text: [
            "Someone asked to reset the password for this Atelier account.",
            "",
            `Reset it here (the link works once, and expires in an hour):`,
            url,
            "",
            "If this wasn't you, ignore this email — nothing has changed, and",
            "you do not need to do anything.",
          ].join("\n"),
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      expiresIn: ONE_HOUR,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await options.email.send({
          to: user.email,
          subject: "Verify your email for Atelier",
          text: [
            "Welcome to Atelier.",
            "",
            "Confirm this address to finish setting up your account:",
            url,
            "",
            "This link expires in an hour.",
          ].join("\n"),
        });
      },
    },

    // ── OAuth (FR-AUTH-2) ────────────────────────────────────────────────
    // Configured only when credentials exist, so a developer without OAuth
    // apps gets a working email/password build rather than a boot failure.
    socialProviders: {
      ...(options.github && { github: options.github }),
      ...(options.google && { google: options.google }),
    },

    // ── Cookies (FR-AUTH-3) ──────────────────────────────────────────────
    advanced: {
      /**
       * Better Auth generates short random string ids; §15 says primary keys
       * are `uuid`, and 0001/0002 declare them that way. Without this, every
       * insert fails with FAILED_TO_CREATE_USER and the cause is invisible —
       * the library reports its own error, not the driver's.
       */
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: isSecure,
      defaultCookieAttributes: {
        httpOnly: true,
        // Never Secure over plain http — the browser drops the cookie and the
        // symptom is "login silently does nothing" on localhost.
        secure: isSecure,
        // Lax, not Strict: Strict drops the cookie on the OAuth callback
        // redirect, so sign-in with GitHub completes and lands logged out.
        sameSite: "lax",
      },
    },

    // ── Rate limiting ────────────────────────────────────────────────────
    rateLimit: {
      enabled: options.rateLimitEnabled ?? true,
      window: 60,
      max: 100,
      // The endpoints worth protecting individually. A global limit generous
      // enough for normal browsing is far too generous for password guessing.
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/reset-password": { window: 3600, max: 5 },
      },
      ...(options.secondaryStorage !== undefined && { storage: "secondary-storage" as const }),
    },
    ...(options.secondaryStorage && { secondaryStorage: options.secondaryStorage }),
  });
}

export type Auth = ReturnType<typeof createAuth>;
