import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "@atelier/observability";
import { isApiError, type ErrorDetail, type ErrorEnvelope, type ErrorType } from "../lib/errors.js";

/**
 * The one place errors become the §16 envelope (§19's layering table).
 *
 * Three handlers, not one, because Fastify produces errors on three different
 * paths and each has its own default shape:
 *
 *   setErrorHandler     thrown errors, including schema validation failures
 *   setNotFoundHandler  no route matched — never reaches the error handler
 *   setSchemaErrorFormatter   how a validation failure becomes an Error
 *
 * Covering only the first is the common mistake, and it leaves a 404 emitting
 * `{"message":"Route GET:/nope not found","error":"Not Found","statusCode":404}`
 * — a second error shape, in the one case clients hit most often.
 */

type ErrorLogger = Pick<Logger, "error" | "warn">;

/** Fastify tags validation errors with the part of the request that failed. */
const VALIDATION_CONTEXTS = new Set(["body", "querystring", "params", "headers"]);

/**
 * Turn Fastify's validation output into §16 `details`.
 *
 * `instancePath` is a JSON Pointer (`/dependencies/0`); §16's `field` is a
 * path a human recognises, so the pointer is unwound. An empty pointer means
 * the failure is on the root object itself, which reads better as the property
 * the schema named than as "".
 */
function toDetails(error: unknown): readonly ErrorDetail[] | undefined {
  const validation = (error as { validation?: unknown }).validation;
  if (!Array.isArray(validation)) return undefined;

  const details = validation.map((issue: Record<string, unknown>) => {
    const pointer = typeof issue["instancePath"] === "string" ? issue["instancePath"] : "";
    const missing = (issue["params"] as { missingProperty?: string } | undefined)?.missingProperty;
    const field = pointer.replace(/^\//, "").replaceAll("/", ".") || missing || "(root)";
    return { field, issue: typeof issue["message"] === "string" ? issue["message"] : "invalid" };
  });

  return details.length > 0 ? details : undefined;
}

function statusToType(status: number): ErrorType {
  if (status === 401) return "authentication_error";
  if (status === 403) return "authorization_error";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  if (status >= 500) return "internal_error";
  return "validation_error";
}

function envelope(input: {
  type: ErrorType;
  code: string;
  message: string;
  details?: readonly ErrorDetail[];
  requestId: string;
}): ErrorEnvelope {
  return {
    error: {
      type: input.type,
      code: input.code,
      message: input.message,
      ...(input.details && { details: input.details }),
      request_id: input.requestId,
    },
  };
}

export function registerErrorHandler(app: FastifyInstance, logger: ErrorLogger): void {
  /**
   * Validation failures arrive here BEFORE the error handler.
   *
   * The default formatter builds a message like
   * `body/email must match format "email"`, which is serviceable prose and a
   * poor `code`. Producing the error ourselves keeps the code stable while the
   * message stays readable.
   */
  app.setSchemaErrorFormatter((errors, dataVar) => {
    const error = new Error(`The ${dataVar} of this request is not valid.`) as Error & {
      statusCode?: number;
      validation?: unknown;
      validationContext?: string;
    };
    error.statusCode = 400;
    error.validation = errors;
    error.validationContext = dataVar;
    return error;
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    // §16: 404 covers "does not exist" AND "not visible to you", and never
    // distinguishes them. Saying which route was missed would be friendlier and
    // would also confirm which routes exist.
    void reply.status(404).send(
      envelope({
        type: "not_found",
        code: "route_not_found",
        message: "Not found.",
        requestId: request.id,
      }),
    );
  });

  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    if (isApiError(error)) {
      // An operator needs the cause; a caller must never see it.
      if (error.status >= 500) {
        logger.error({ err: error, code: error.code, requestId }, "request failed");
      }
      const retryAfter = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
      if (retryAfter !== undefined) void reply.header("retry-after", String(retryAfter));

      void reply.status(error.status).send(
        envelope({
          type: error.type,
          code: error.code,
          message: error.message,
          ...(error.details && { details: error.details }),
          requestId,
        }),
      );
      return;
    }

    const status = (error as { statusCode?: number }).statusCode ?? 500;

    if (status >= 500) {
      /**
       * The message is DISCARDED, not forwarded.
       *
       * An unexpected error's message is written for us, not for a caller: it
       * carries table names, driver text, file paths, occasionally a connection
       * string. §16 says the message never leaks internals, and the only way to
       * guarantee that for an error nobody anticipated is to not use it.
       */
      logger.error({ err: error, requestId }, "unhandled error");
      void reply.status(500).send(
        envelope({
          type: "internal_error",
          code: "internal_error",
          message: "Something went wrong on our side.",
          requestId,
        }),
      );
      return;
    }

    const context = (error as { validationContext?: string }).validationContext;
    const details = toDetails(error);
    void reply.status(status).send(
      envelope({
        type: statusToType(status),
        code:
          context !== undefined && VALIDATION_CONTEXTS.has(context)
            ? `invalid_${context}`
            : "bad_request",
        // Below 500 the message is Fastify's or ours and is safe by
        // construction — these are the errors we caused deliberately.
        message: error instanceof Error ? error.message : "Bad request.",
        ...(details && { details }),
        requestId,
      }),
    );
  });
}
