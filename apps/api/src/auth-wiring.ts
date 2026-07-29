import { drizzle } from "drizzle-orm/postgres-js";
import { createClient, createDatabase, provisionPersonalOrganization } from "@atelier/db";
import { createAuth, type Auth } from "@atelier/auth";
import { createConsoleEmailAdapter, createResendEmailAdapter } from "@atelier/email";
import type { EmailPort } from "@atelier/domain";
import type { Env } from "@atelier/config";
import type { Logger } from "@atelier/observability";
import type { Sql } from "postgres";

/**
 * Assembles authentication from configuration.
 *
 * This is the one place that decides which database ROLE authentication runs
 * as, and it is the only place that could get it wrong. ADR-010 splits identity
 * from tenancy across two Postgres roles; nothing downstream can detect a
 * mistake here, because a Drizzle handle does not know which role it
 * authenticated as. Everything hangs on `AUTH_DATABASE_URL` being the auth
 * role's credentials — which is why the failure below is loud rather than a
 * fallback to `DATABASE_URL`.
 *
 * Falling back would be the tempting, friendly thing to do and would silently
 * collapse the boundary: every route would work, every test would pass, and
 * the request-serving role would quietly hold password hashes.
 */

export type AuthWiring = { auth: Auth; sql: Sql; close: () => Promise<void> };

export type CreateAuthWiringOptions = {
  /**
   * The APPLICATION connection (`atelier_app`), not the auth one.
   *
   * FR-ORG-1's personal organization is tenant data, and `atelier_auth` has no
   * grant on `organizations` (ADR-010) — so provisioning has to run on the
   * other side of the boundary. Passing the wrong connection here fails loudly
   * at the first signup rather than silently widening anything, because the
   * grant simply is not there.
   */
  readonly appSql: Sql;
};

class AuthConfigurationError extends Error {
  override readonly name = "AuthConfigurationError";
}

/** Whether the environment carries enough to serve auth routes at all. */
export function isAuthConfigured(env: Env): boolean {
  return env.AUTH_DATABASE_URL !== undefined && env.BETTER_AUTH_SECRET !== undefined;
}

function selectEmailAdapter(env: Env, logger: Logger): EmailPort {
  if (env.RESEND_API_KEY !== undefined && env.EMAIL_FROM !== undefined) {
    return createResendEmailAdapter({
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      // The provider's error goes to the redacting logger, never to a caller.
      onError: (error) => {
        logger.error({ err: error }, "email delivery failed");
      },
    });
  }

  // No provider configured: print the link instead of sending it. Right
  // locally, and deliberately visible in the log rather than silent — a
  // verification email that goes nowhere without saying so is worse than one
  // that fails.
  logger.warn("no email provider configured; verification links will be logged, not sent");
  return createConsoleEmailAdapter({
    write: (line) => {
      logger.info({ email: line }, "email (not sent)");
    },
  });
}

export function createAuthWiring(
  env: Env,
  logger: Logger,
  options: CreateAuthWiringOptions,
): AuthWiring {
  if (env.AUTH_DATABASE_URL === undefined || env.BETTER_AUTH_SECRET === undefined) {
    throw new AuthConfigurationError(
      "AUTH_DATABASE_URL and BETTER_AUTH_SECRET are both required to serve authentication. " +
        "AUTH_DATABASE_URL must be the `atelier_auth` role, NOT the same credentials as " +
        "DATABASE_URL — see ADR-010.",
    );
  }

  // A small pool: auth is a fraction of request volume, and this connection is
  // the one that can read credentials, so its concurrency is worth keeping low.
  const sql = createClient({ connectionString: env.AUTH_DATABASE_URL, max: 5 });

  const appDb = createDatabase(options.appSql);

  const auth = createAuth({
    database: drizzle(sql),
    /**
     * FR-ORG-1, at the only moment it can happen.
     *
     * Runs on the APP connection, so the organization and its owner membership
     * are written by the role that owns tenant data. Throwing fails the signup
     * on purpose — FR-ORG-2 scopes everything by `organization_id`, so a user
     * with no organization cannot own anything.
     *
     * KNOWN GAP (D-011): the user row is already committed by the time this
     * runs, so a failure here leaves a user with no organization. Repairing
     * that lazily needs to ask "does this user have any organization?", which
     * is a cross-tenant read and needs the session-claim change this milestone
     * deliberately did not make. Recorded rather than hidden.
     */
    onUserCreated: async (user) => {
      const organization = await provisionPersonalOrganization(appDb, {
        userId: user.id,
        email: user.email,
        ...(user.name !== undefined && { name: user.name }),
      });
      logger.info(
        { userId: user.id, organizationId: organization.organizationId, slug: organization.slug },
        "provisioned personal organization",
      );
    },
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.AUTH_BASE_URL ?? `http://localhost:${env.PORT}`,
    email: selectEmailAdapter(env, logger),
    emailFrom: env.EMAIL_FROM ?? "Atelier <noreply@localhost>",
    trustedOrigins: env.AUTH_BASE_URL === undefined ? [] : [env.AUTH_BASE_URL],
    // The schema guarantees these arrive in pairs, so checking one is enough.
    ...(env.GITHUB_CLIENT_ID !== undefined && {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET as string,
      },
    }),
    ...(env.GOOGLE_CLIENT_ID !== undefined && {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET as string,
      },
    }),
  });

  return { auth, sql, close: () => sql.end({ timeout: 5 }) };
}
