/**
 * Authentication (M014).
 *
 * The database handle given to `createAuth` must be on the `atelier_auth`
 * connection — see ADR-010 and packages/db/src/auth-isolation.integration.test.ts.
 */
export { createAuth, type CreateAuthOptions, type Auth } from "./auth.js";
export { hashPassword, verifyPassword, ARGON2_OPTIONS } from "./password.js";
