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
const SECRET_VARIABLES = new Set(["ANTHROPIC_API_KEY", "DATABASE_URL"]);

export function isSecretVariable(name: string): boolean {
  return SECRET_VARIABLES.has(name);
}

const NODE_ENVIRONMENTS = ["development", "test", "production"] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** A Postgres connection string, not merely a URL. */
const postgresUrl = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "postgres:" || url.protocol === "postgresql:";
    } catch {
      return false;
    }
  },
  { message: "must be a postgres:// or postgresql:// connection string" },
);

const envObject = z.object({
  NODE_ENV: z.enum(NODE_ENVIRONMENTS).default("development"),

  DATABASE_URL: postgresUrl,

  /**
   * Optional outside production so a clean checkout can run the test suite
   * and the dev server without a real model key. Required in production by
   * the refinement below — a production deploy that cannot reach the model
   * provider is not a working deploy, and discovering that on the first
   * request is worse than refusing to boot.
   */
  ANTHROPIC_API_KEY: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("sk-ant-"), {
      // Shape only. This deliberately says nothing about the value itself.
      message: "does not look like an Anthropic API key (expected an sk-ant- prefix)",
    })
    .optional(),

  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export const envSchema = envObject.superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && env.ANTHROPIC_API_KEY === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["ANTHROPIC_API_KEY"],
      message: "is required when NODE_ENV=production",
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
