import { z } from "zod";

/**
 * Validated process environment.
 *
 * The contract is simple and absolute: the process either has a complete, valid
 * configuration or it does not start. There is no partial boot, no lazily
 * discovered missing variable at 3am, and no `process.env.THING!` scattered
 * through the codebase — {@link loadEnv} is the only place the environment is
 * read, and it returns a typed object or throws.
 *
 * Two design choices are load-bearing:
 *
 *  1. **Every failure is reported at once.** Fail-on-first turns a
 *     five-variable misconfiguration into five restarts. The error lists all
 *     of them.
 *
 *  2. **A secret's value never appears in the message.** §17 is explicit —
 *     "a secret-shaped string in a log is a P1 incident with rotation" — and a
 *     validation error is exactly the kind of thing that gets pasted into a
 *     ticket. Variables marked `secret` report what was wrong, never what was
 *     seen. Non-secrets DO echo the value, because "expected a URL, got
 *     `localhost:5432`" is the difference between a fix and a guess.
 */

/** A variable whose value must never be echoed back in an error or a log. */
const SECRET_VARIABLES = new Set([
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "DATABASE_URL",
  // M014. AUTH_DATABASE_URL differs from DATABASE_URL only in credentials, and
  // those credentials reach password hashes (ADR-010) - so it is at least as
  // sensitive as the one above it.
  "AUTH_DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
]);

export function isSecretVariable(name: string): boolean {
  return SECRET_VARIABLES.has(name);
}

const NODE_ENVIRONMENTS = ["development", "test", "production"] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** A Postgres connection string, not merely a URL. */
const postgresUrl = z.string().superRefine((value, ctx) => {
  // An unresolved platform reference, caught before the generic message.
  //
  // Railway, Render and Fly all use this `${{Service.VAR}}` shape, and when the
  // reference does not resolve the LITERAL template arrives as the value. The
  // generic message below is then actively misleading: it sends you to inspect
  // a connection string, when the thing to fix is the reference that was meant
  // to produce one. This cost an evening on the first staging deploy — the
  // container crash-looped eleven times saying "must be a postgres:// …" while
  // the actual fault was a reference that had never been applied.
  if (value.includes("${{")) {
    ctx.addIssue({
      code: "custom",
      message:
        "is an unresolved platform reference (it still contains `${{…}}`). " +
        "Check that the referenced service name matches EXACTLY — they are " +
        "case-sensitive — and that the variable change was applied and redeployed",
    });
    return;
  }

  let protocol: string | undefined;
  try {
    protocol = new URL(value).protocol;
  } catch {
    /* falls through to the issue below */
  }

  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    ctx.addIssue({
      code: "custom",
      message: "must be a postgres:// or postgresql:// connection string",
    });
  }
});

const envObject = z.object({
  NODE_ENV: z.enum(NODE_ENVIRONMENTS).default("development"),

  DATABASE_URL: postgresUrl,

  /**
   * Model provider credentials.
   *
   * All three are optional individually; the refinement below requires AT LEAST
   * ONE in production. Naming a single provider as the required one would bake
   * in a choice that is still open — the owner's stated plan is OpenRouter with
   * Groq as failover, while ADR-002 (Managed Agents) is still the architecture
   * of record and is Anthropic-only. Nothing in the codebase calls a model yet,
   * so this schema stays deliberately provider-agnostic until it does.
   *
   * See the model-provider entry in docs/decisions/DECISION-LOG.md.
   */
  ANTHROPIC_API_KEY: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("sk-ant-"), {
      // Shape only. This deliberately says nothing about the value itself.
      message: "does not look like an Anthropic API key (expected an sk-ant- prefix)",
    })
    .optional(),

  /** Primary provider in the owner's plan. Keys are `sk-or-v1-…`. */
  OPENROUTER_API_KEY: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("sk-or-"), {
      message: "does not look like an OpenRouter API key (expected an sk-or- prefix)",
    })
    .optional(),

  /** Failover provider. Keys are `gsk_…`. */
  GROQ_API_KEY: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("gsk_"), {
      message: "does not look like a Groq API key (expected a gsk_ prefix)",
    })
    .optional(),

  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),

  /**
   * OTLP collector endpoint. Absent means tracing runs with no exporter — spans
   * are still created and then dropped, which is the right default locally and
   * in tests. Failing to boot without a collector would make the collector a
   * hard dependency of every process, which is the opposite of what telemetry
   * should cost.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),

  /** Port to listen on. Railway injects this; 3001 locally. */
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),

  /** Git SHA of the running build, surfaced on / so a deploy is identifiable. */
  GIT_SHA: z.string().optional(),

  /**
   * Shared store for rate-limit windows (§16, M020).
   *
   * Optional, and its absence is the interesting case: without it the limiter
   * keeps windows in process memory, which is correct for ONE replica and wrong
   * for several — N replicas each counting separately enforce N times the
   * limit. That is not an approximation, it is the limit not existing, and the
   * failure is silent because each replica looks perfectly correct.
   */
  REDIS_URL: z
    .string()
    .refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), {
      message: "must be a redis:// or rediss:// connection string",
    })
    .optional(),

  /**
   * Connection for the authentication module (ADR-010).
   *
   * The same database as DATABASE_URL, as a DIFFERENT ROLE. `atelier_auth` can
   * read identity and cannot touch tenant data; `atelier_app` is the reverse
   * and cannot read a password hash. Pointing both at the same credentials
   * would collapse that boundary silently — everything would work, and the
   * separation asserted by the isolation suite would be fiction.
   *
   * Optional: a process that serves no auth routes does not need it. `apps/api`
   * requires it explicitly at the point it builds the auth handler, which is
   * the only place that can tell.
   */
  AUTH_DATABASE_URL: postgresUrl.optional(),

  /** Signs session cookies and tokens. Rotating it invalidates every session. */
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters").optional(),

  /** Public origin the auth endpoints are reached on, e.g. https://api.example.com */
  AUTH_BASE_URL: z.url().optional(),

  /** Transactional email (ADR-011). Keys are `re_…`. */
  RESEND_API_KEY: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("re_"), {
      message: "does not look like a Resend API key (expected an re_ prefix)",
    })
    .optional(),

  /** From address for verification and reset mail. Must be a verified domain. */
  EMAIL_FROM: z.string().min(1).optional(),

  /** OAuth (FR-AUTH-2). Both halves of a pair are required together. */
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

/** Every credential that can reach a model. */
export const MODEL_PROVIDER_VARIABLES = [
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

/** OAuth providers, as the pairs they have to be configured in. */
const OAUTH_PAIRS = [
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
] as const;

export const envSchema = envObject.superRefine((env, ctx) => {
  // Half a provider is worse than none: the app boots, the button renders, and
  // the failure arrives at the redirect with the user already committed.
  for (const [id, secret] of OAUTH_PAIRS) {
    if ((env[id] === undefined) !== (env[secret] === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: [env[id] === undefined ? id : secret],
        message: `is required when ${env[id] === undefined ? secret : id} is set — a provider needs both halves`,
      });
    }
  }

  // At least one provider in production, not a specific one. A deploy that
  // cannot reach any model is not a working deploy, and finding that out on the
  // first request is worse than refusing to boot — but which provider is still
  // an open decision, and the schema should not settle it.
  const configured = MODEL_PROVIDER_VARIABLES.filter((name) => env[name] !== undefined);

  if (env.NODE_ENV === "production" && configured.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["OPENROUTER_API_KEY"],
      message: `is required when NODE_ENV=production — set at least one of ${MODEL_PROVIDER_VARIABLES.join(", ")}`,
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Every variable the schema knows about — the source of truth `.env.example` is
 * checked against. Read from the object rather than from `envSchema`, which is
 * wrapped by superRefine and no longer exposes a shape.
 */
export const ENV_VARIABLE_NAMES: readonly string[] = Object.keys(envObject.shape).toSorted((a, b) =>
  a.localeCompare(b),
);

/**
 * Thrown when the environment is invalid.
 *
 * Carries the structured issues as well as the rendered message, so a future
 * structured logger (M006) can emit them as fields rather than re-parsing
 * prose.
 */
export class EnvironmentError extends Error {
  override readonly name = "EnvironmentError";

  constructor(
    readonly issues: readonly { variable: string; problem: string }[],
    message: string,
  ) {
    super(message);
  }
}

function renderIssue(variable: string, problem: string, received: unknown): string {
  const detail =
    problem.startsWith("is ") || problem.startsWith("must ") ? problem : `— ${problem}`;

  if (isSecretVariable(variable)) {
    // No value, not even a redacted length: a length is a hint, and this string
    // ends up in logs, tickets and screenshots.
    return `  ${variable} ${detail}`;
  }
  if (received === undefined) {
    return `  ${variable} ${detail}`;
  }
  return `  ${variable} ${detail} (received: ${JSON.stringify(received)})`;
}

/**
 * Validate the environment, or throw.
 *
 * @param source defaults to `process.env`; injectable so tests never have to
 *   mutate the real environment, which leaks between test files.
 * @throws {EnvironmentError} listing every problem found.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const variable = issue.path.map(String).join(".") || "(environment)";
    return {
      variable,
      problem: issue.message,
      received: source[variable],
    };
  });

  const lines = issues.map((i) => renderIssue(i.variable, i.problem, i.received));
  const message = [
    `Invalid environment — ${issues.length} problem${issues.length === 1 ? "" : "s"}:`,
    ...lines,
    "",
    "See .env.example for every variable this process requires.",
  ].join("\n");

  throw new EnvironmentError(
    issues.map(({ variable, problem }) => ({ variable, problem })),
    message,
  );
}

/**
 * Validate at startup and exit non-zero if the environment is unusable.
 *
 * Separate from {@link loadEnv} because exiting the process is a decision only
 * an entrypoint gets to make — a library that calls `process.exit` is a library
 * nobody can test or embed.
 */
export function loadEnvOrExit(source: Record<string, string | undefined> = process.env): Env {
  try {
    return loadEnv(source);
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) {
      process.stderr.write(`\n${error.message}\n\n`);
      // Exiting IS this function's purpose, which is why it is named for it and
      // kept separate from loadEnv(). Entrypoints call this one; everything else
      // calls loadEnv and handles the error, so no caller is forced into
      // something untestable.
      // eslint-disable-next-line unicorn/no-process-exit -- justified: see above
      process.exit(78); // EX_CONFIG, sysexits.h — "configuration error"
    }
    throw error;
  }
}
