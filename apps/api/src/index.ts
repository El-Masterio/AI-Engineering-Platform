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
