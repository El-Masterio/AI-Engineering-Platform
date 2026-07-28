import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ENV_VARIABLE_NAMES,
  EnvironmentError,
  isSecretVariable,
  loadEnv,
  type Env,
} from "./env.js";

/** `KEY=value` lines from .env.example, ignoring comments and blanks. */
async function exampleKeys(): Promise<string[]> {
  const contents = await readFile(".env.example", "utf8");
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split("=", 1)[0]?.trim() ?? "")
    .filter(Boolean)
    .toSorted((a, b) => a.localeCompare(b));
}

const VALID_DATABASE_URL = "postgresql://postgres:hunter2@localhost:5432/atelier";
const VALID_API_KEY = "sk-ant-EXAMPLE-not-a-real-key";

/** A complete, valid environment; spread it and override the one thing under test. */
function validEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: "development",
    LOG_LEVEL: "info",
    DATABASE_URL: VALID_DATABASE_URL,
    ANTHROPIC_API_KEY: VALID_API_KEY,
    ...overrides,
  };
}

/** Run `loadEnv` and return the error it threw, or fail loudly. */
function expectRejection(source: Record<string, string | undefined>): EnvironmentError {
  let thrown: unknown;
  try {
    loadEnv(source);
  } catch (error: unknown) {
    thrown = error;
  }
  expect(thrown, "expected the environment to be rejected").toBeInstanceOf(EnvironmentError);
  return thrown as EnvironmentError;
}

describe("a valid environment", () => {
  it("parses and applies defaults", () => {
    const env: Env = loadEnv({ DATABASE_URL: VALID_DATABASE_URL });

    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.DATABASE_URL).toBe(VALID_DATABASE_URL);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("ignores variables it does not know about", () => {
    // The environment always contains PATH, HOME and a hundred others. A schema
    // that rejected unknown keys could never run anywhere.
    const env = loadEnv(validEnv({ PATH: "/usr/bin", SOME_CI_VARIABLE: "1" }));
    expect(env.NODE_ENV).toBe("development");
  });
});

describe("a missing required variable stops startup", () => {
  it("names the variable and says what is expected", () => {
    const error = expectRejection({});

    expect(error.issues.map((i) => i.variable)).toContain("DATABASE_URL");
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain(".env.example");
  });

  it("requires the model key in production and not otherwise", () => {
    const production = expectRejection(
      validEnv({ NODE_ENV: "production", ANTHROPIC_API_KEY: undefined }),
    );
    expect(production.issues).toContainEqual({
      variable: "ANTHROPIC_API_KEY",
      problem: "is required when NODE_ENV=production",
    });

    // The same environment is fine in development.
    expect(() => loadEnv(validEnv({ ANTHROPIC_API_KEY: undefined }))).not.toThrow();
  });
});

describe("a malformed value is rejected", () => {
  it.each([
    ["not-a-url", "bare string"],
    ["localhost:5432", "host:port with no scheme"],
    ["mysql://user:pass@localhost:3306/atelier", "the wrong database"],
    ["https://example.com/atelier", "an http URL"],
  ])("rejects DATABASE_URL=%s (%s)", (value) => {
    const error = expectRejection(validEnv({ DATABASE_URL: value }));
    expect(error.issues.map((i) => i.variable)).toContain("DATABASE_URL");
  });

  it("rejects a LOG_LEVEL outside the enum", () => {
    const error = expectRejection(validEnv({ LOG_LEVEL: "verbose" }));
    expect(error.issues.map((i) => i.variable)).toContain("LOG_LEVEL");
  });

  it("rejects an API key of the wrong shape", () => {
    const error = expectRejection(validEnv({ ANTHROPIC_API_KEY: "definitely-not-a-key" }));
    expect(error.issues.map((i) => i.variable)).toContain("ANTHROPIC_API_KEY");
  });
});

describe("every problem is reported at once", () => {
  it("does not stop at the first failure", () => {
    // Fail-on-first turns one misconfiguration into one restart per variable.
    const error = expectRejection({ NODE_ENV: "staging", LOG_LEVEL: "loud" });

    const named = error.issues.map((i) => i.variable);
    expect(named).toContain("NODE_ENV");
    expect(named).toContain("LOG_LEVEL");
    expect(named).toContain("DATABASE_URL");
    expect(error.message).toContain("3 problems");
  });
});

describe("secrets never appear in the error", () => {
  /**
   * §17: "Logs are scrubbed; a secret-shaped string in a log is a P1 incident
   * with rotation." A validation error is precisely the string that ends up in
   * a ticket, a screenshot or a CI log, so it must not carry the value.
   */
  it("does not echo a rejected API key", () => {
    const leaked = "sk-live-THIS-MUST-NOT-APPEAR-ANYWHERE";
    const error = expectRejection(validEnv({ ANTHROPIC_API_KEY: leaked }));

    expect(error.message).toContain("ANTHROPIC_API_KEY");
    expect(error.message).not.toContain(leaked);
    expect(JSON.stringify(error.issues)).not.toContain(leaked);
  });

  it("does not echo a malformed DATABASE_URL, because the password is inside it", () => {
    const leaked = "postgres-with-a-password-hunter2-in-it";
    const error = expectRejection(validEnv({ DATABASE_URL: leaked }));

    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).not.toContain("hunter2");
    expect(error.message).not.toContain(leaked);
  });

  it("DOES echo a non-secret value, because that is what makes the error useful", () => {
    const error = expectRejection(validEnv({ LOG_LEVEL: "verbose" }));
    expect(error.message).toContain("verbose");
  });

  it("agrees with itself about which variables are secret", () => {
    expect(isSecretVariable("ANTHROPIC_API_KEY")).toBe(true);
    expect(isSecretVariable("DATABASE_URL")).toBe(true);
    expect(isSecretVariable("LOG_LEVEL")).toBe(false);
    expect(isSecretVariable("NODE_ENV")).toBe(false);
  });
});

describe(".env.example", () => {
  /**
   * M005 acceptance: "`.env.example` covers every variable."
   *
   * Checked in BOTH directions. Missing keys are the obvious failure; stray
   * keys matter just as much, because a variable documented here but absent
   * from the schema is one somebody will set and wonder why nothing happens.
   */
  it("lists exactly the variables the schema defines", async () => {
    expect(await exampleKeys()).toEqual([...ENV_VARIABLE_NAMES]);
  });

  it("parses cleanly through the schema itself", async () => {
    // The documented example must be a WORKING configuration, not merely a
    // complete list of names.
    const contents = await readFile(".env.example", "utf8");
    const parsed: Record<string, string> = {};
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      parsed[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }

    expect(() => loadEnv(parsed)).not.toThrow();
  });

  it("contains no real credential", async () => {
    const contents = await readFile(".env.example", "utf8");
    // The placeholder is allowlisted in .gitleaks.toml; anything else that
    // looks like a live key has no business in a committed file.
    const keyLike = contents.match(/sk-ant-[\w-]+/g) ?? [];
    for (const candidate of keyLike) {
      expect(candidate, "a committed example must never hold a real key").toContain("EXAMPLE");
    }
  });
});
