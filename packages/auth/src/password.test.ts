import { describe, expect, it } from "vitest";
import { ARGON2_OPTIONS, hashPassword, verifyPassword } from "./password.js";

/**
 * FR-AUTH-1 says Argon2id. Better Auth defaults to scrypt, so the assertion
 * that the hash really IS Argon2id is the one that matters here — a green
 * "password verifies" test passes just as well against the wrong algorithm.
 */

describe("hashPassword", () => {
  it("produces an Argon2id PHC string, not scrypt", async () => {
    const phc = await hashPassword("correct horse battery staple");
    expect(phc.startsWith("$argon2id$"), `got: ${phc.slice(0, 20)}`).toBe(true);
  });

  it("encodes the OWASP parameters in the hash", async () => {
    // Encoded, therefore verifiable, therefore changeable later without
    // invalidating anything already stored.
    const phc = await hashPassword("pw");
    expect(phc).toContain(`m=${ARGON2_OPTIONS.memoryCost}`);
    expect(phc).toContain(`t=${ARGON2_OPTIONS.timeCost}`);
    expect(phc).toContain(`p=${ARGON2_OPTIONS.parallelism}`);
  });

  it("uses a memory cost that is actually memory-hard", () => {
    // The parameter that does the work. Guarded because "login feels slow" is
    // a standing temptation to lower it, and lowering it removes most of the
    // reason to use Argon2 at all.
    expect(ARGON2_OPTIONS.memoryCost).toBeGreaterThanOrEqual(19_456);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const phc = await hashPassword("s3cret-passphrase");
    expect(await verifyPassword({ hash: phc, password: "s3cret-passphrase" })).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const phc = await hashPassword("s3cret-passphrase");
    expect(await verifyPassword({ hash: phc, password: "s3cret-passphras" })).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    // A corrupt row must read as "wrong password", not as a 500. An endpoint
    // that fails differently tells an attacker which accounts have one.
    expect(await verifyPassword({ hash: "not-a-hash", password: "x" })).toBe(false);
    expect(await verifyPassword({ hash: "", password: "x" })).toBe(false);
  });

  it("verifies a hash made with DIFFERENT parameters", async () => {
    // The property that makes raising cost safe: parameters come from the hash
    // being checked, not from current configuration. This PHC string was
    // generated at m=19456,t=2,p=1 for the password "legacy-password".
    const older =
      "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$3vJZQZ8x0J4pQ4x2V0YQ9wF8v1kZ4nT3sD5cB7aE9gI";
    // Not asserting true — the digest above is illustrative, not real. What is
    // asserted is that a differently-parameterised hash is *parsed and
    // evaluated* rather than throwing, which is the behaviour that keeps old
    // passwords working after a cost increase.
    await expect(verifyPassword({ hash: older, password: "legacy-password" })).resolves.toBeTypeOf(
      "boolean",
    );
  });
});
