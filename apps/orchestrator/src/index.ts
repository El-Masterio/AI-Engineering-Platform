import { loadEnvOrExit, type Env } from "@atelier/config";
import { PACKAGE_NAME as DOMAIN } from "@atelier/domain";

/**
 * Durable job workers driving milestone and task state machines
 *
 * See §12. Placeholder — M001 establishes the skeleton only.
 */
export const PACKAGE_NAME = "@atelier/orchestrator" as const;

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
