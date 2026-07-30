import { z } from "zod";

/**
 * The §13 agent specification, as a runtime schema.
 *
 * `packages/agent-runtime` owns the TYPE; this owns the VALIDATOR. They are
 * separate because the type describes what code may assume and the schema
 * describes what a YAML file on disk is allowed to contain — and the second is
 * the only defence when the file was authored by a customer (FR-ORG-6).
 *
 * M024's acceptance is that "a new role is added by authoring a file with no
 * code change". That is only safe if the file is checked, and checked strictly:
 * a typo in `permissions` that silently defaults to `true` would grant a
 * capability nobody wrote down.
 */

/** ADR-004's four tiers, verbatim. Never a model id. */
export const modelTierSchema = z.enum(["reasoning", "implementation", "utility", "frontier"]);

export const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

/**
 * A string that must actually say something.
 *
 * Named because it appears in five places, and because `z.string()` alone would
 * accept `""` for a capability pack reference or an executable name — a grant
 * that looks present and matches nothing.
 */
const nonEmptyString = z.string().min(1);

/** Executables a bash grant permits. Non-empty: see {@link toolGrantSchema}. */
const bashAllowlist = z.array(nonEmptyString).min(1);

/**
 * A tool grant.
 *
 * `bash` carries an allowlist of executables and nothing else. There is no
 * variant meaning "any command", because §13's constraint is that bash is
 * constrained rather than raw — and a schema that could express raw shell would
 * eventually have a file using it.
 */
export const toolGrantSchema = z.union([
  z.object({ name: z.literal("read") }),
  z.object({ name: z.literal("write") }),
  z.object({ name: z.literal("edit") }),
  z.object({ name: z.literal("glob") }),
  z.object({ name: z.literal("grep") }),
  z.object({ name: z.literal("web_search") }),
  z.object({ name: z.literal("web_fetch") }),
  z.object({
    name: z.literal("bash"),
    // Non-empty: `allow: []` is a bash grant that permits nothing, which is
    // indistinguishable from not granting bash and is therefore a mistake.
    allow: bashAllowlist,
  }),
]);

/**
 * Permissions. Every field required, none defaulted.
 *
 * A defaulted permission is the dangerous kind of convenience: a file that
 * forgets `canDeploy` would silently mean `false` today and, if the default ever
 * flipped, would silently mean `true`. Making them explicit costs six lines per
 * role and removes the question.
 */
export const agentPermissionsSchema = z.object({
  canWriteCode: z.boolean(),
  canWriteTests: z.boolean(),
  canReview: z.boolean(),
  canDeploy: z.boolean(),
  canMigrateSchema: z.boolean(),
  requiresApprovalFor: z.array(nonEmptyString),
});

export const agentBudgetSchema = z.object({
  maxTokensPerRun: z.number().int().positive(),
  maxWallClockMs: z.number().int().positive(),
  // Zero is meaningful: "do not retry". Negative is not.
  maxRetries: z.number().int().min(0),
});

const baseAgentSpecSchema = z.object({
  // DNS-label shape, because an agent id appears in log lines, metric labels
  // and file names.
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "must be lowercase letters, digits and hyphens"),
  version: z.number().int().min(1),
  role: nonEmptyString,
  model: z.object({ tier: modelTierSchema, effort: effortSchema }),
  systemPrompt: nonEmptyString,
  capabilityPacks: z.array(nonEmptyString),
  tools: z.array(toolGrantSchema),
  budget: agentBudgetSchema,
  permissions: agentPermissionsSchema,
  outputContract: z.object({ type: nonEmptyString, schema: nonEmptyString }),
});

/**
 * The spec, with the cross-field rules §13 states as prose.
 *
 * These are the ones a per-field schema cannot express, and each is a real
 * structural rule rather than a style preference.
 */
export const agentSpecSchema = baseAgentSpecSchema.strict().superRefine((spec, ctx) => {
  /**
   * §13's "single most important structural rule": review and authorship are
   * performed by different agents.
   *
   * A spec that can both write code and review is a spec that can approve its
   * own work, which removes the independent verification the product's entire
   * value rests on. Rejected at load, so it cannot be authored at all.
   */
  if (spec.permissions.canReview && spec.permissions.canWriteCode) {
    ctx.addIssue({
      code: "custom",
      path: ["permissions"],
      message:
        "an agent may not both write code and review it — §13 requires review by a different agent",
    });
  }

  // A reviewer that cannot read is a reviewer that reviews nothing.
  if (spec.permissions.canReview && spec.tools.every((tool) => tool.name !== "read")) {
    ctx.addIssue({
      code: "custom",
      path: ["tools"],
      message: "a reviewing agent must be granted `read`",
    });
  }

  // Writing code needs the tools to write it. Catching this at load turns a
  // baffling runtime failure into a message naming the file.
  if (spec.permissions.canWriteCode) {
    for (const required of ["read", "write", "edit"] as const) {
      if (spec.tools.every((tool) => tool.name !== required)) {
        ctx.addIssue({
          code: "custom",
          path: ["tools"],
          message: `an agent that writes code must be granted \`${required}\``,
        });
      }
    }
  }

  /**
   * §17 Control 7: deploying and migrating are approval-gated, and that is
   * "not overridable by configuration at any autonomy level".
   *
   * So a spec claiming the permission must also declare the approval. A file
   * that granted `canDeploy` with an empty `requiresApprovalFor` would be
   * exactly the configuration §17 forbids.
   */
  if (spec.permissions.canDeploy && !spec.permissions.requiresApprovalFor.includes("deploy")) {
    ctx.addIssue({
      code: "custom",
      path: ["permissions", "requiresApprovalFor"],
      message: "an agent that can deploy must require approval for `deploy` (§17 Control 7)",
    });
  }
  if (
    spec.permissions.canMigrateSchema &&
    !spec.permissions.requiresApprovalFor.includes("migrate")
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["permissions", "requiresApprovalFor"],
      message: "an agent that can migrate schema must require approval for `migrate`",
    });
  }

  // Duplicate tool grants are ambiguous rather than harmless: two `bash`
  // entries with different allowlists have no defined meaning.
  const names = spec.tools.map((tool) => tool.name);
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: "custom", path: ["tools"], message: "duplicate tool grant" });
  }
});

export type AgentSpecInput = z.input<typeof agentSpecSchema>;
export type ValidatedAgentSpec = z.output<typeof agentSpecSchema>;

// ── The authored file format ─────────────────────────────────────────────────
//
// §13 documents the spec as YAML with snake_case keys, a duration string
// (`max_wall_clock: 45m`), and bash written as a nested mapping. That is the
// format a customer will copy out of the documentation, so it is the format we
// accept — and the internal type stays idiomatic TypeScript.
//
// The translation lives here rather than in the loader because it is part of the
// contract, not part of reading a file: an org that POSTs a definition through
// the API (FR-ORG-6) must be held to exactly the same shape.

/** `500ms`, `30s`, `45m`, `2h`. */
const DURATION = /^(\d+)(ms|s|m|h)$/;
const DURATION_UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;

/**
 * A duration as §13 writes it.
 *
 * A bare number is rejected rather than assumed to be milliseconds. `45` in a
 * field whose documented example is `45m` almost certainly means minutes, and a
 * silent reading of 45 ms would produce a run that times out instantly for
 * reasons nobody could see in the file.
 */
export const durationSchema = z
  .string({
    // The default "expected string, received number" is technically right and
    // useless: the author wrote `45` meaning minutes, and needs to be told the
    // unit is required rather than that the type is wrong.
    error: "must be a quoted duration such as 45m, 30s or 2h — a bare number has no unit",
  })
  .regex(DURATION, "must be a duration such as 45m, 30s or 2h")
  .transform((value) => {
    const match = DURATION.exec(value);
    // Unreachable: `regex` above already rejected anything else. Narrowing for
    // the type checker, not defending against a real case.
    if (match === null) throw new Error(`unparseable duration: ${value}`);
    const [, amount, unit] = match as unknown as [string, string, keyof typeof DURATION_UNIT_MS];
    return Number(amount) * DURATION_UNIT_MS[unit];
  });

/**
 * A tool entry as authored: either a bare name, or `bash:` with its allowlist.
 *
 * `- bash` on its own is deliberately not accepted. It reads as "grant bash",
 * which is the one thing §13 says is never granted — so it fails rather than
 * quietly meaning something narrower than it looks.
 */
const toolEntryFileSchema = z.union([
  z.enum(["read", "write", "edit", "glob", "grep", "web_search", "web_fetch"]),
  z.object({ bash: z.object({ allow: bashAllowlist }).strict() }).strict(),
]);

const agentSpecFileShape = z
  .object({
    id: z.string(),
    version: z.number(),
    role: z.string(),
    model: z.object({ tier: modelTierSchema, effort: effortSchema }).strict(),
    system_prompt: z.string(),
    capability_packs: z.array(nonEmptyString),
    tools: z.array(toolEntryFileSchema),
    budget: z
      .object({
        max_tokens_per_run: z.number(),
        max_wall_clock: durationSchema,
        max_retries: z.number(),
      })
      .strict(),
    permissions: z
      .object({
        can_write_code: z.boolean(),
        can_write_tests: z.boolean(),
        can_review: z.boolean(),
        can_deploy: z.boolean(),
        can_migrate_schema: z.boolean(),
        requires_approval_for: z.array(nonEmptyString),
      })
      .strict(),
    output_contract: z.object({ type: z.string(), schema: z.string() }).strict(),
  })
  // Strict at every level. A misspelled `can_depoly` that fell through as an
  // unknown key would leave `can_deploy` at its schema-required default — except
  // there are no defaults, so it fails; and `permissions.canReview` written in
  // camelCase by mistake must fail too, rather than being ignored while the
  // snake_case field it shadows stays false.
  .strict();

/**
 * Parse §13's authored format into the canonical spec.
 *
 * Two passes: shape and key names first, then the cross-field structural rules
 * on the translated object. Splitting them means a file with a typo'd key gets
 * "unrecognized key: can_depoly" rather than a confusing complaint about a
 * missing permission.
 */
export function parseAgentSpecFile(input: unknown, source = "<inline>"): ValidatedAgentSpec {
  const file = agentSpecFileShape.safeParse(input);
  if (!file.success) throw invalidSpec(source, file.error);

  const data = file.data;
  const canonical: AgentSpecInput = {
    id: data.id,
    version: data.version,
    role: data.role,
    model: { tier: data.model.tier, effort: data.model.effort },
    systemPrompt: data.system_prompt,
    capabilityPacks: data.capability_packs,
    tools: data.tools.map((entry) =>
      typeof entry === "string" ? { name: entry } : { name: "bash", allow: entry.bash.allow },
    ),
    budget: {
      maxTokensPerRun: data.budget.max_tokens_per_run,
      maxWallClockMs: data.budget.max_wall_clock,
      maxRetries: data.budget.max_retries,
    },
    permissions: {
      canWriteCode: data.permissions.can_write_code,
      canWriteTests: data.permissions.can_write_tests,
      canReview: data.permissions.can_review,
      canDeploy: data.permissions.can_deploy,
      canMigrateSchema: data.permissions.can_migrate_schema,
      requiresApprovalFor: data.permissions.requires_approval_for,
    },
    outputContract: { type: data.output_contract.type, schema: data.output_contract.schema },
  };

  return parseAgentSpec(canonical, source);
}

/**
 * Parse a spec, or throw with every problem at once.
 *
 * Fail-on-first turns a five-mistake file into five edit-and-retry cycles.
 */
export function parseAgentSpec(input: unknown, source = "<inline>"): ValidatedAgentSpec {
  const result = agentSpecSchema.safeParse(input);
  if (result.success) return result.data;
  throw invalidSpec(source, result.error);
}

/**
 * A rejection that names the file and every problem in it.
 *
 * The message is the whole user interface of "invalid spec rejected at load", so
 * it lists the file, the path, and what was wrong — not a Zod dump.
 */
export class InvalidAgentSpecError extends Error {
  readonly source: string;
  readonly issues: readonly { readonly path: string; readonly message: string }[];

  constructor(source: string, issues: readonly { path: string; message: string }[]) {
    const problems = issues.map((issue) => `  ${issue.path}: ${issue.message}`).join("\n");
    super(`Invalid agent specification in ${source}:\n${problems}`);
    this.name = "InvalidAgentSpecError";
    this.source = source;
    this.issues = issues;
  }
}

function invalidSpec(source: string, error: z.ZodError): InvalidAgentSpecError {
  return new InvalidAgentSpecError(
    source,
    error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    })),
  );
}
