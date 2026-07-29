/**
 * The §16 error envelope, and the error types that produce it.
 *
 * One shape, everywhere:
 *
 *   { "error": { "type", "code", "message", "details"?, "request_id" } }
 *
 * The value of "one shape" is entirely in the *everywhere*. An envelope that
 * covers the errors we remember to throw, while Fastify's own 404s and
 * validation failures come out in its default shape, is not a convention — it
 * is a convention plus a set of exceptions that clients have to special-case.
 * So the handler in `error-handler.plugin.ts` converts everything, and this
 * file is only the vocabulary.
 */

/** Broad class. §16: "stable forever" — clients branch on this. */
export type ErrorType =
  | "validation_error"
  | "authentication_error"
  | "authorization_error"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal_error"
  | "unavailable";

export type ErrorDetail = {
  readonly field: string;
  readonly issue: string;
};

export type ErrorEnvelope = {
  readonly error: {
    readonly type: ErrorType;
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ErrorDetail[];
    readonly request_id: string;
  };
};

/**
 * An error that already knows what it should look like on the wire.
 *
 * The alternative — mapping error classes to status codes in the handler — puts
 * the HTTP meaning a long way from the code that knows the situation, and the
 * mapping table becomes the thing nobody updates.
 */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly details: readonly ErrorDetail[] | undefined;

  constructor(
    readonly status: number,
    readonly type: ErrorType,
    /** Machine-readable, specific, documented, stable (§16). */
    readonly code: string,
    /**
     * Human-readable and SAFE TO DISPLAY.
     *
     * §16 is explicit: never leaks internals, SQL, stack traces, or the
     * existence of another tenant's resources. Anything an operator needs but a
     * caller must not see belongs in `cause`, which the handler logs and never
     * serialises.
     */
    message: string,
    options: { details?: readonly ErrorDetail[]; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.details = options.details;
  }
}

/** 400 — the request could not be understood. */
export function badRequest(
  code: string,
  message: string,
  details?: readonly ErrorDetail[],
): ApiError {
  return new ApiError(400, "validation_error", code, message, { ...(details && { details }) });
}

/** 403 — authenticated, but not permitted. */
export function forbidden(message = "You do not have access to this resource."): ApiError {
  return new ApiError(403, "authorization_error", "forbidden", message);
}

/**
 * 404 — not found, **or** not visible to this tenant.
 *
 * §16: "never distinguish, it's an enumeration oracle". There is deliberately no
 * `notVisible()` counterpart, because the moment one exists someone will reach
 * for it and the two responses will differ in some detail that leaks.
 */
export function notFound(resource = "resource", message?: string): ApiError {
  return new ApiError(404, "not_found", `${resource}_not_found`, message ?? "Not found.");
}

/** 409 — state conflict, including an optimistic-lock mismatch. */
export function conflict(code: string, message: string): ApiError {
  return new ApiError(409, "conflict", code, message);
}

/** 422 — understood, well-formed, and semantically wrong. */
export function unprocessable(
  code: string,
  message: string,
  details?: readonly ErrorDetail[],
): ApiError {
  return new ApiError(422, "validation_error", code, message, { ...(details && { details }) });
}

// No `unauthenticated()` or `unavailable()` helper yet.
//
// Both are in §16's vocabulary and neither has a caller: authentication rejects
// through Better Auth's own handler, and nothing yet reports a dependency as
// unavailable. `ErrorType` still names them, so the envelope covers the cases
// the moment something raises one — but an unused constructor is dead code, and
// knip is right to say so. M017's policy engine adds `forbidden`'s sibling when
// it has something to refuse.

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
