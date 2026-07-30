/**
 * Zod schemas and generated API types shared across services (§16).
 */
export const PACKAGE_NAME = "@atelier/contracts" as const;

export {
  agentBudgetSchema,
  agentPermissionsSchema,
  agentSpecSchema,
  durationSchema,
  effortSchema,
  InvalidAgentSpecError,
  modelTierSchema,
  parseAgentSpec,
  parseAgentSpecFile,
  toolGrantSchema,
  type AgentSpecInput,
  type ValidatedAgentSpec,
} from "./agent-spec.schema.js";
