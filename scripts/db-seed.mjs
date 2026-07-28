#!/usr/bin/env node
/**
 * `pnpm db:seed`. Idempotent — safe against a database that already has it.
 * See scripts/db-migrate.mjs for why this lives here and not in packages/db.
 */
import { loadEnv } from "@atelier/config";
import { createClient, seed } from "@atelier/db";

const env = loadEnv();
const sql = createClient({ connectionString: env.DATABASE_URL, max: 2 });

try {
  const summary = await seed(sql);
  console.log(
    `seeded ${summary.organizations} organizations, ${summary.users} users, ` +
      `${summary.memberships} memberships`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
