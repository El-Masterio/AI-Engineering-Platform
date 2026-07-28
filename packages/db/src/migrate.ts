import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "postgres";

/**
 * Migration runner.
 *
 * Hand-written SQL rather than drizzle-kit output, because §15 requires three
 * things drizzle-kit does not provide: `NNNN_verb_noun` names, a reviewed
 * diff a human actually reads, and a tested `down` for every `up`. Drizzle
 * remains the typed query surface; SQL is the source of truth for DDL.
 *
 * The obvious hazard in that split is drift between the two. That is covered by
 * a test which introspects the migrated database and compares it against the
 * Drizzle schema — see schema-drift.test.ts.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/** `0001_create_tenancy_and_identity.up.sql` → version 1. */
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

export type Migration = {
  version: number;
  name: string;
  upPath: string;
  downPath: string;
};

export type MigrationRecord = {
  version: number;
  name: string;
  checksum: string;
  appliedAt: Date;
};

/** Content hash of the `up` file, so an applied migration cannot be edited quietly. */
async function checksum(filePath: string): Promise<string> {
  const contents = await readFile(filePath, "utf8");
  // Normalise line endings: the same migration checked out on Windows and on a
  // Linux runner must hash identically, or CI reports tampering on every run.
  return createHash("sha256").update(contents.replaceAll("\r\n", "\n")).digest("hex");
}

/** Every migration on disk, ordered by version. Throws if an `up` has no `down`. */
export async function loadMigrations(directory = MIGRATIONS_DIR): Promise<Migration[]> {
  const entries = await readdir(directory);
  const ups = new Map<number, { name: string; file: string }>();
  const downs = new Set<string>();

  for (const entry of entries) {
    const match = FILE_PATTERN.exec(entry);
    if (!match) continue;
    const [, digits, name, direction] = match;
    if (direction === "down") {
      downs.add(`${digits}_${name}`);
    } else {
      ups.set(Number(digits), { name: name ?? "", file: entry });
    }
  }

  const migrations = [...ups]
    .map(([version, { name, file }]) => ({
      version,
      name,
      upPath: path.join(directory, file),
      downPath: path.join(directory, file.replace(".up.sql", ".down.sql")),
    }))
    .toSorted((a, b) => a.version - b.version);

  for (const migration of migrations) {
    const key = `${String(migration.version).padStart(4, "0")}_${migration.name}`;
    if (!downs.has(key)) {
      throw new Error(
        `Migration ${key} has no .down.sql. §24 principle 5: an untested rollback is a hope.`,
      );
    }
  }

  // A gap means someone deleted or misnumbered a migration; applying the rest
  // would produce a schema nobody has reviewed as a whole.
  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migration versions must be contiguous from 0001. Expected ${index + 1}, found ${migration.version}.`,
      );
    }
  }

  return migrations;
}

/**
 * Bootstrap the ledger. Not itself a migration — it has to exist before the
 * runner can record anything, so it is created idempotently on every run.
 */
async function ensureLedger(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    integer     PRIMARY KEY,
      name       text        NOT NULL,
      checksum   text        NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

export async function appliedMigrations(sql: Sql): Promise<MigrationRecord[]> {
  await ensureLedger(sql);
  const rows = await sql<
    { version: number; name: string; checksum: string; applied_at: Date }[]
  >`SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version`;
  return rows.map((r) => ({
    version: r.version,
    name: r.name,
    checksum: r.checksum,
    appliedAt: r.applied_at,
  }));
}

/**
 * Apply every pending migration, each in its own transaction.
 *
 * Per-migration transactions rather than one big one: if 0003 fails, 0001 and
 * 0002 stay applied and the ledger says so. A single wrapping transaction would
 * roll the whole set back and leave no record of how far it got.
 *
 * @returns the versions applied by this call.
 */
export async function migrateUp(sql: Sql): Promise<number[]> {
  const migrations = await loadMigrations();
  const applied = await appliedMigrations(sql);
  const appliedByVersion = new Map(applied.map((a) => [a.version, a]));

  // Verify before changing anything: an edited migration means the database and
  // the repository disagree about what was run, and no further migration should
  // be applied on top of that.
  for (const migration of migrations) {
    const record = appliedByVersion.get(migration.version);
    if (record === undefined) continue;
    const current = await checksum(migration.upPath);
    if (current !== record.checksum) {
      throw new Error(
        `Migration ${migration.version} (${migration.name}) was modified after it was applied.\n` +
          `  applied: ${record.checksum}\n  on disk: ${current}\n` +
          `Migrations are forward-only (§15). Write a new migration instead of editing this one.`,
      );
    }
  }

  const performed: number[] = [];
  for (const migration of migrations) {
    if (appliedByVersion.has(migration.version)) continue;
    const contents = await readFile(migration.upPath, "utf8");
    const hash = await checksum(migration.upPath);

    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES (${migration.version}, ${migration.name}, ${hash})
      `;
    });
    performed.push(migration.version);
  }
  return performed;
}

/**
 * Roll back the most recently applied migration.
 *
 * One step at a time and never by version number. Rolling back to an arbitrary
 * point invites someone to skip an intermediate `down`, and a partially
 * reversed schema is worse than either end state.
 *
 * @returns the version rolled back, or undefined if nothing was applied.
 */
export async function migrateDown(sql: Sql): Promise<number | undefined> {
  const applied = await appliedMigrations(sql);
  const last = applied.at(-1);
  if (last === undefined) return undefined;

  const migrations = await loadMigrations();
  const migration = migrations.find((m) => m.version === last.version);
  if (migration === undefined) {
    throw new Error(
      `Migration ${last.version} is recorded as applied but is not on disk; cannot roll back.`,
    );
  }

  const contents = await readFile(migration.downPath, "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(contents);
    await tx`DELETE FROM schema_migrations WHERE version = ${last.version}`;
  });
  return last.version;
}
