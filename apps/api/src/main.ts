/**
 * Process entrypoint.
 *
 * Order matters and is the reason this file is separate from server.ts:
 * tracing must start before the modules it instruments are imported, and the
 * environment must be validated before anything tries to use it. Both fail
 * silently when done in the wrong order (§M005, §M006).
 */
import { bootstrap } from "./index.js";
import { createClient } from "@atelier/db";
import { startApiServer } from "./server.js";
import { createAuthWiring, isAuthConfigured } from "./auth-wiring.js";
import { createRateLimitStore } from "./rate-limit-wiring.js";

const { env, logger } = bootstrap();

// Two connections, two roles, on purpose (ADR-010). `sql` is `atelier_app` and
// cannot read a password hash; the auth connection is `atelier_auth` and cannot
// read tenant data. Collapsing them onto one credential would still work, which
// is exactly what makes it worth stating here.
const sql = createClient({ connectionString: env.DATABASE_URL, max: 5 });

const authWiring = isAuthConfigured(env)
  ? createAuthWiring(env, logger, { appSql: sql })
  : undefined;
if (authWiring === undefined) {
  // Not fatal: a worker or migration job has no reason to hold a connection
  // that can read credentials. Loud, because a missing /api/auth/* on a service
  // that was supposed to serve it looks like a routing bug for a long time.
  logger.warn("AUTH_DATABASE_URL or BETTER_AUTH_SECRET absent; /api/auth/* will 404");
}

const rateLimit = createRateLimitStore(env, logger);

const server = await startApiServer({
  port: env.PORT,
  logger,
  sql,
  rateLimitStore: rateLimit.store,
  ...(env.GIT_SHA !== undefined && { revision: env.GIT_SHA }),
  ...(authWiring !== undefined && { authHandler: authWiring.auth.handler }),
});

// The auth pool has to drain with everything else, or SIGTERM leaves a
// connection open and the container waits out its grace period on every deploy.
const stopServer = server.shutdown;
server.shutdown = async () => {
  await stopServer();
  await authWiring?.close();
  await rateLimit.close();
  await sql.end({ timeout: 5 });
};
