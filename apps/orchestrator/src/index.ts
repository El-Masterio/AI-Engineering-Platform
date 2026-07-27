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
