#!/usr/bin/env node
/**
 * Create `.env` from `.env.example` if it is missing.
 *
 * `DATABASE_URL` has no default and never will: a required variable that
 * silently falls back to localhost is how a production process ends up happily
 * connected to nothing (§M005). So the local path provisions the file instead
 * of the schema relaxing, and `pnpm setup` stays one command.
 *
 * Never overwrites an existing `.env`.
 */
import { copyFile, access } from "node:fs/promises";

const EXAMPLE = ".env.example";
const TARGET = ".env";

try {
  await access(TARGET);
  console.log(`${TARGET} already exists — leaving it alone`);
} catch {
  await copyFile(EXAMPLE, TARGET);
  console.log(`created ${TARGET} from ${EXAMPLE} — edit it if your setup differs`);
}
