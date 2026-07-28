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

const { env, logger } = bootstrap();
const sql = createClient({ connectionString: env.DATABASE_URL, max: 5 });

await startApiServer({
  port: env.PORT,
  logger,
  sql,
  ...(env.GIT_SHA !== undefined && { revision: env.GIT_SHA }),
});
