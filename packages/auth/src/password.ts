import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing (FR-AUTH-1: Argon2id).
 *
 * Better Auth defaults to **scrypt**, not Argon2id. The requirement is
 * explicit, so this is supplied to `emailAndPassword.password` rather than
 * assumed — a default that happens to be adjacent to the requirement is not
 * the requirement.
 *
 * `@node-rs/argon2` over the `argon2` package: it ships prebuilt binaries for
 * `linux-x64-musl` and `linux-arm64-musl`, which are the two architectures the
 * Alpine image is built for (ADR-009). The alternative needs node-gyp and a
 * build toolchain inside the runtime image, which is both slower and a larger
 * attack surface for no benefit.
 */

/**
 * OWASP's second recommended Argon2id configuration (2024): 19 MiB, 2
 * iterations, 1 degree of parallelism.
 *
 * The memory cost is the parameter that matters. Argon2 resists GPU and ASIC
 * attack by being memory-hard, so lowering `memoryCost` to make login faster
 * removes most of the reason to use Argon2 at all. If these ever need tuning,
 * the honest way is to measure hash time on the deployment target and raise
 * cost until it is ~250ms — not to lower it until logins feel quick.
 *
 * Changing any of these does NOT invalidate existing hashes: the parameters are
 * encoded in the PHC string, so `verify` reads them from the hash it is
 * checking. New passwords get the new cost; old ones keep working.
 */
/**
 * `Algorithm.Argon2id` from the library, inlined as its numeric value.
 *
 * `Algorithm` is an ambient `const enum`, which `verbatimModuleSyntax` (our
 * tsconfig, §21) cannot import — the enum has no runtime representation to
 * import. Relaxing the compiler flag for one constant would be the wrong trade,
 * so the value is written out and asserted by the test that reads `$argon2id$`
 * back out of the hash.
 */
const ARGON2ID = 2;

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  /** KiB. 19456 = 19 MiB. */
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hash a password. Returns a PHC string carrying the parameters used. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash. A corrupt row must
 * read as "wrong password" and not as a 500 — an endpoint that fails
 * differently for a malformed hash tells an attacker which accounts have one.
 */
export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(input.hash, input.password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
