#!/usr/bin/env node
/**
 * Migration CLI.
 *
 *   pnpm db:migrate        apply everything pending
 *   pnpm db:migrate down   reverse exactly one
 *
 * Lives in scripts/ rather than packages/db because it is an entrypoint, not
 * library code. It reads the environment, and §19 keeps packages/db pointing
 * inward — a data-access package that reaches for `process.env` is one you
 * cannot embed, test against a second database, or reuse.
 */
import { loadEnv } from "@atelier/config";
import { createClient, migrateDown, migrateUp } from "@atelier/db";

const direction = process.argv[2] ?? "up";
const env = loadEnv();
const sql = createClient({ connectionString: env.DATABASE_URL, max: 2 });

try {
  if (direction === "down") {
    const version = await migrateDown(sql);
    console.log(version === undefined ? "nothing to roll back" : `rolled back ${version}`);
  } else if (direction === "up") {
    const applied = await migrateUp(sql);
    console.log(applied.length === 0 ? "already up to date" : `applied ${applied.join(", ")}`);
  } else {
    console.error(`unknown direction ${JSON.stringify(direction)} — expected "up" or "down"`);
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
