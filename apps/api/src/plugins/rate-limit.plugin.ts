import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "@atelier/observability";
import { ApiError } from "../lib/errors.js";
import {
  RATE_LIMITS,
  decide,
  rateLimitKey,
  tierFor,
  type RateLimitStore,
} from "../lib/rate-limit.js";

/**
 * §16's limits, applied to every request (§19 names this file).
 *
 * Headers on EVERY response, not only on a 429. A client that can see it has
 * 4 requests left can slow down; a client that only learns at the moment of
 * rejection can only retry, which is how a rate limit turns a busy client into
 * a retry storm.
 */

export type RateLimitPluginOptions = {
  readonly store: RateLimitStore;
  readonly logger: Logger;
  /**
   * Paths that are never limited.
   *
   * Probes only. An orchestrator polls `/readyz` far more often than any user
   * polls anything, and rate-limiting it means the container is killed for
   * being healthy.
   */
  readonly exempt?: readonly string[];
};

const DEFAULT_EXEMPT = ["/healthz", "/readyz"];

/** Set on the request by the auth plugin once it exists (M0xx). */
type MaybeAuthenticated = FastifyRequest & {
  apiKey?: { id: string; organizationId: string };
  tenant?: { organizationId: string };
};

export function registerRateLimit(app: FastifyInstance, options: RateLimitPluginOptions): void {
  const exempt = new Set([...DEFAULT_EXEMPT, ...(options.exempt ?? [])]);

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const [path = ""] = request.url.split("?", 1);
    if (exempt.has(path)) return;

    const authenticated = request as MaybeAuthenticated;
    const apiKeyId = authenticated.apiKey?.id;
    const organizationId =
      authenticated.apiKey?.organizationId ?? authenticated.tenant?.organizationId;

    const tier = tierFor(request.method, apiKeyId !== undefined);
    const { limit, windowMs } = RATE_LIMITS[tier];

    const key = rateLimitKey({
      tier,
      ...(organizationId !== undefined && { organizationId }),
      ...(apiKeyId !== undefined && { apiKeyId }),
      // `request.ip` respects trustProxy, which is set — behind Railway's edge
      // the socket address is the proxy's, and limiting on it would throttle
      // every customer as one.
      ip: request.ip,
    });

    let decision;
    try {
      decision = decide(await options.store.hit(key, windowMs, limit), limit);
    } catch (error: unknown) {
      /**
       * FAIL OPEN, loudly.
       *
       * If Redis is unreachable the choice is between rejecting every request
       * and enforcing no limit. Rejecting turns a dependency blip into a total
       * outage; the limiter protects against abuse, and abuse during a Redis
       * outage is a smaller problem than being down. The warning is what stops
       * this being a silent loss of the control.
       */
      options.logger.warn({ err: error }, "rate limiter unavailable; allowing the request");
      return;
    }

    void reply.header("ratelimit-limit", String(decision.limit));
    void reply.header("ratelimit-remaining", String(decision.remaining));
    void reply.header("ratelimit-reset", String(decision.resetAt));

    if (!decision.allowed) {
      void reply.header("retry-after", String(decision.retryAfter));
      throw new ApiError(
        429,
        "rate_limited",
        "rate_limited",
        "Too many requests. Try again shortly.",
      );
    }
  });
}
