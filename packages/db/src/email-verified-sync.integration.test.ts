import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./testing/harness.js";

/**
 * Migration 0003: `email_verified` (boolean, required by Better Auth) and
 * `email_verified_at` (timestamptz, required by the domain and by §17's audit
 * requirement) are two columns holding one fact.
 *
 * That is only defensible if they cannot disagree, so this file attacks the
 * pair from every direction a writer could come from — the library writing the
 * boolean, the domain writing the timestamp, seeds writing either, and an
 * update touching neither.
 *
 * The CHECK constraint is the backstop. Every "must throw" case below would be
 * a silent inconsistency without it.
 */

let h: Harness;
let next = 0;

/** A fresh user id per test — these tests mutate rows. */
function userId(): string {
  next += 1;
  return `aaaaaaaa-0000-4000-8000-${String(next).padStart(12, "0")}`;
}

async function insertUser(
  columns: Record<string, unknown> = {},
): Promise<{ id: string; verified: boolean; verifiedAt: Date | null }> {
  const id = userId();
  const record = { id, email: `user-${id}@example.test`, ...columns };
  await h.owner`INSERT INTO users ${h.owner(record)}`;
  return read(id);
}

async function read(
  id: string,
): Promise<{ id: string; verified: boolean; verifiedAt: Date | null }> {
  const [row] = await h.owner<{ email_verified: boolean; email_verified_at: Date | null }[]>`
    SELECT email_verified, email_verified_at FROM users WHERE id = ${id}
  `;
  return { id, verified: row?.email_verified ?? false, verifiedAt: row?.email_verified_at ?? null };
}

beforeAll(async () => {
  h = await startHarness();
}, 180_000);

afterAll(async () => {
  await h?.stop();
}, 60_000);

describe("on insert", () => {
  it("defaults to unverified with no timestamp", async () => {
    const row = await insertUser();
    expect(row.verified).toBe(false);
    expect(row.verifiedAt).toBeNull();
  });

  it("derives the boolean when only the timestamp is supplied", async () => {
    // How seeds and the domain write.
    const row = await insertUser({ email_verified_at: new Date() });
    expect(row.verified).toBe(true);
  });

  it("derives the timestamp when only the boolean is supplied", async () => {
    // How Better Auth writes.
    const row = await insertUser({ email_verified: true });
    expect(row.verified).toBe(true);
    expect(row.verifiedAt).not.toBeNull();
  });
});

describe("on update — the library's direction", () => {
  it("stamps a timestamp when the boolean flips true", async () => {
    const { id } = await insertUser();
    await h.owner`UPDATE users SET email_verified = true WHERE id = ${id}`;

    const row = await read(id);
    expect(row.verifiedAt).not.toBeNull();
  });

  it("clears the timestamp when the boolean flips false", async () => {
    const { id } = await insertUser({ email_verified_at: new Date() });
    await h.owner`UPDATE users SET email_verified = false WHERE id = ${id}`;

    const row = await read(id);
    expect(row.verifiedAt).toBeNull();
  });

  it("does NOT move an existing timestamp when re-verified", async () => {
    // The audit trail wants the FIRST verification. Restamping would quietly
    // rewrite history every time the flag was touched.
    const original = new Date("2020-01-01T00:00:00Z");
    const { id } = await insertUser({ email_verified_at: original });

    await h.owner`UPDATE users SET email_verified = true WHERE id = ${id}`;

    const row = await read(id);
    expect(row.verifiedAt?.toISOString()).toBe(original.toISOString());
  });
});

describe("on update — the domain's direction", () => {
  it("sets the boolean when a timestamp is written", async () => {
    const { id } = await insertUser();
    await h.owner`UPDATE users SET email_verified_at = now() WHERE id = ${id}`;
    const row = await read(id);
    expect(row.verified).toBe(true);
  });

  it("clears the boolean when the timestamp is nulled", async () => {
    const { id } = await insertUser({ email_verified_at: new Date() });
    await h.owner`UPDATE users SET email_verified_at = NULL WHERE id = ${id}`;
    const row = await read(id);
    expect(row.verified).toBe(false);
  });

  it("wins over the boolean when a single statement sets both to disagree", async () => {
    // Ambiguous input needs a defined winner, and the timestamp carries
    // strictly more information than the flag derived from it.
    const { id } = await insertUser();
    await h.owner`
      UPDATE users SET email_verified_at = now(), email_verified = false WHERE id = ${id}
    `;

    const row = await read(id);
    expect(row.verified).toBe(true);
    expect(row.verifiedAt).not.toBeNull();
  });
});

describe("an unrelated update leaves the pair alone", () => {
  it("does not stamp a verification when only the name changes", async () => {
    const { id } = await insertUser();
    await h.owner`UPDATE users SET name = 'Ada' WHERE id = ${id}`;

    const row = await read(id);
    expect(row.verified).toBe(false);
    expect(row.verifiedAt).toBeNull();
  });

  it("does not disturb an existing verification", async () => {
    const original = new Date("2021-06-06T12:00:00Z");
    const { id } = await insertUser({ email_verified_at: original });
    await h.owner`UPDATE users SET name = 'Grace' WHERE id = ${id}`;

    const row = await read(id);
    expect(row.verified).toBe(true);
    expect(row.verifiedAt?.toISOString()).toBe(original.toISOString());
  });
});

describe("the CHECK constraint is the backstop", () => {
  it("exists, so an inconsistent row is impossible even if the trigger were dropped", async () => {
    // The trigger being correct is a claim; this makes it an invariant the
    // database enforces, including against a future migration that forgets
    // this one exists.
    const [row] = await h.owner<{ count: string }[]>`
      SELECT count(*)::text FROM pg_constraint
      WHERE conname = 'chk_users_email_verified_agrees'
    `;
    expect(row?.count).toBe("1");
  });

  it("rejects a disagreeing row when the trigger is not in the way", async () => {
    // Prove the constraint bites rather than assuming it. The trigger would
    // normally correct this, so it is disabled for the length of one
    // transaction — which is also the closest thing to "what if the trigger
    // were wrong" that can be written.
    const id = userId();
    let error: unknown;
    try {
      await h.owner.begin(async (tx) => {
        await tx`ALTER TABLE users DISABLE TRIGGER trg_users_sync_email_verified`;
        await tx`
          INSERT INTO users (id, email, email_verified, email_verified_at)
          VALUES (${id}, ${`x-${id}@example.test`}, true, NULL)
        `;
      });
    } catch (error_: unknown) {
      error = error_;
    }

    // Asserting the CONSTRAINT, not merely that something threw. "It threw" is
    // satisfied by the ALTER failing, by a syntax error, or by the connection
    // dropping - none of which prove the invariant is enforced.
    expect(error, "an inconsistent row was accepted").toBeDefined();
    expect((error as { code?: string }).code, "failed for the wrong reason").toBe("23514");
    expect((error as { constraint_name?: string }).constraint_name).toBe(
      "chk_users_email_verified_agrees",
    );
  });
});
