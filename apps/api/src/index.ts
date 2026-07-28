import { loadEnvOrExit, type Env } from "@atelier/config";
import { PACKAGE_NAME as DOMAIN } from "@atelier/domain";

/**
 * Fastify HTTP service. Framework scaffolding lands at M016
 *
 * See §16. Placeholder — M001 establishes the skeleton only.
 * The import above exists to prove workspace protocol resolution (M001 acceptance).
 */
export const PACKAGE_NAME = "@atelier/api" as const;

export function describe(): string {
  return `${PACKAGE_NAME} (depends on ${DOMAIN})`;
}

/**
 * Validate the environment before anything else happens.
 *
 * §M005: the process refuses to boot on invalid configuration. This runs first
 * and on failure writes every problem to stderr and exits 78 (EX_CONFIG) — so a
 * misconfigured deploy dies at start, loudly, instead of at the first request
 * that happens to need the missing value.
 *
 * The server itself is still a placeholder; what is real here is that the
 * environment gate exists and is the first thing on the path.
 */
export function bootstrap(): Env {
  return loadEnvOrExit();
}
