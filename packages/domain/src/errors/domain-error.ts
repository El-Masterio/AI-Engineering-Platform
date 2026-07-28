/**
 * Domain errors.
 *
 * A domain error means "the rules of the business forbid this" — not "the
 * database was unreachable" and not "you are not allowed". It carries a stable
 * `code` so the API layer can map it to an envelope (§16) without matching on
 * prose, and so a message can be reworded without breaking a caller.
 *
 * Deliberately no HTTP status here. The domain does not know what HTTP is, and
 * the moment it does, testing a business rule needs a web framework.
 */

export const DOMAIN_ERROR_CODES = [
  "INVALID_SLUG",
  "INVALID_NAME",
  "INVALID_EMAIL",
  "INVALID_PLAN",
  "INVALID_ROLE",
  "LAST_OWNER",
  "ALREADY_MEMBER",
  "NOT_A_MEMBER",
  "ALREADY_ARCHIVED",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class DomainError extends Error {
  override readonly name = "DomainError";

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    /** Field this concerns, when it concerns one. Lets a form highlight it. */
    readonly field?: string,
  ) {
    super(message);
  }
}

/** Narrowing helper — `instanceof` across package boundaries is fragile. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof Error && error.name === "DomainError";
}
