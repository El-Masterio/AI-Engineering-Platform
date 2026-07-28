import { DomainError } from "../errors/domain-error.js";
import type { Clock, Timestamp } from "../ports/clock.port.js";

/**
 * User — global identity.
 *
 * Deliberately NOT tenant-scoped. A person may belong to several organizations
 * and is the same person in each; modelling identity per tenant means the same
 * human has several accounts, several passwords and several audit trails.
 * §15's RLS policies reflect the same decision — `users` is visible through a
 * shared membership rather than owned by a tenant.
 */

export type User = {
  readonly id: string;
  /** Always stored normalised. See {@link normalizeEmail}. */
  readonly email: string;
  readonly name?: string;
  readonly emailVerifiedAt?: Timestamp;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
};

/**
 * Practical, not RFC 5322.
 *
 * A fully compliant address regex is famously enormous and still accepts
 * things no mail server will deliver to. The real check is sending a
 * verification email; this exists to catch typos early and to keep obviously
 * malformed input out of the database.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const EMAIL_MAX_LENGTH = 254; // RFC 5321 limit on a forward path.
const NAME_MAX_LENGTH = 120;

/**
 * Lowercase and trim — nothing else.
 *
 * Notably NOT stripping dots or `+tag` parts: those are Gmail conventions, not
 * standards, and treating `a.b@` and `ab@` as the same person is wrong for most
 * providers. Over-normalising merges two real accounts, which is far worse than
 * letting someone register twice.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(normalized);
}

/** @throws {DomainError} INVALID_EMAIL */
export function assertValidEmail(email: string): void {
  if (!isValidEmail(email)) {
    throw new DomainError("INVALID_EMAIL", `"${email}" is not a valid email address.`, "email");
  }
}

export type RegisterUserInput = {
  id: string;
  email: string;
  name?: string;
};

/** @throws {DomainError} INVALID_EMAIL, INVALID_NAME */
export function registerUser(input: RegisterUserInput, clock: Clock): User {
  assertValidEmail(input.email);

  const name = input.name?.trim();
  if (name !== undefined && name.length > NAME_MAX_LENGTH) {
    throw new DomainError(
      "INVALID_NAME",
      `A name cannot exceed ${NAME_MAX_LENGTH} characters.`,
      "name",
    );
  }

  const now = clock.now();
  return {
    id: input.id,
    email: normalizeEmail(input.email),
    // An empty string is not a name; it is a field somebody left blank.
    ...(name !== undefined && name.length > 0 && { name }),
    createdAt: now,
    updatedAt: now,
  };
}

export function isEmailVerified(user: User): boolean {
  return user.emailVerifiedAt !== undefined;
}

/** Idempotent: verifying twice keeps the FIRST timestamp, which is the true one. */
export function verifyEmail(user: User, clock: Clock): User {
  if (isEmailVerified(user)) return user;
  const now = clock.now();
  return { ...user, emailVerifiedAt: now, updatedAt: now };
}

/** @throws {DomainError} INVALID_EMAIL */
export function changeEmail(user: User, email: string, clock: Clock): User {
  assertValidEmail(email);
  const normalized = normalizeEmail(email);
  if (normalized === user.email) return user;

  // Changing the address invalidates the verification. Keeping it would let
  // someone verify a throwaway address and then swap in one they do not own.
  const { emailVerifiedAt: _wasVerified, ...rest } = user;
  return { ...rest, email: normalized, updatedAt: clock.now() };
}

/** @throws {DomainError} INVALID_NAME */
export function renameUser(user: User, name: string, clock: Clock): User {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DomainError("INVALID_NAME", "A name cannot be blank.", "name");
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new DomainError(
      "INVALID_NAME",
      `A name cannot exceed ${NAME_MAX_LENGTH} characters.`,
      "name",
    );
  }
  return { ...user, name: trimmed, updatedAt: clock.now() };
}
