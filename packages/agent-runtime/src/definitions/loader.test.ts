// @vitest-environment node
//
// Reads YAML from disk and writes fixtures to a temp directory.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidAgentSpecError } from "@atelier/contracts";
import { isExecutableAllowed, isToolGranted } from "../spec.js";
import { PLATFORM_ROLES_DIR, loadDefinitionFile, loadDefinitions } from "./loader.js";

/**
 * M024's acceptance criteria, as tests.
 *
 *   · a new role is added by authoring a file with no code change
 *   · an invalid spec is rejected at load
 *
 * (The third — versions immutable once referenced by a run — is a database
 * property and lives in agent-definitions.integration.test.ts.)
 *
 * The rejection cases are the ones that matter. "No code change to add a role"
 * is only safe if the file is checked hard, so each case below is a file that a
 * careless loader would accept and that must not load.
 */

let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "atelier-roles-"));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** Write a definition file and try to load it. */
async function loadYaml(name: string, body: string): Promise<unknown> {
  const file = path.join(scratch, name);
  await writeFile(file, body, "utf8");
  return loadDefinitionFile(file);
}

/**
 * A spec that loads, as a base for mutating one thing at a time.
 *
 * The id is interpolated rather than substituted afterwards, so the fixture has
 * one shape and the `.replace` calls below only ever change the thing under test.
 */
const validYaml = (name: string): string => `
id: ${name}
version: 1
role: Test Role
model:
  tier: implementation
  effort: high
system_prompt: |
  Do the thing.
capability_packs:
  - platform/backend-engineering
tools:
  - read
  - write
  - edit
budget:
  max_tokens_per_run: 1000
  max_wall_clock: 10m
  max_retries: 1
permissions:
  can_write_code: true
  can_write_tests: false
  can_review: false
  can_deploy: false
  can_migrate_schema: false
  requires_approval_for: []
output_contract:
  type: task_result
  schema: TaskResultSchema
`;

describe("the six MVP roles load from disk", () => {
  it("loads all six with no code that names any of them", async () => {
    // The acceptance criterion. Nothing in the loader mentions a role — it lists
    // a directory — so adding a seventh file is the whole procedure.
    const loaded = await loadDefinitions(PLATFORM_ROLES_DIR);

    expect(loaded.map((definition) => definition.spec.id)).toEqual([
      "backend-engineer",
      "code-reviewer",
      "director",
      "frontend-engineer",
      "qa-engineer",
      "software-architect",
    ]);
  });

  it("honours §13's structural rule across the whole corpus", async () => {
    // Review and authorship are performed by different agents. Checked over the
    // real corpus rather than trusted from the schema, because the interesting
    // failure is a future role that quietly grants both.
    const loaded = await loadDefinitions(PLATFORM_ROLES_DIR);

    for (const { spec, source } of loaded) {
      expect(
        spec.permissions.canReview && spec.permissions.canWriteCode,
        `${source} both writes and reviews code`,
      ).toBe(false);
    }

    expect(
      loaded.some((definition) => definition.spec.permissions.canReview),
      "no role in the corpus can review — the rule above is vacuous",
    ).toBe(true);
  });

  it("gives the Code Reviewer read-only tools", async () => {
    // §13: "A Code Reviewer with write access will eventually fix what it should
    // have reported."
    const { spec } = await loadDefinitionFile(path.join(PLATFORM_ROLES_DIR, "code-reviewer.yaml"));

    expect(isToolGranted(spec, "read")).toBe(true);
    for (const tool of ["write", "edit", "bash"]) {
      expect(isToolGranted(spec, tool), `the reviewer may ${tool}`).toBe(false);
    }
  });

  it("translates §13's nested bash grant into an executable allowlist", async () => {
    const { spec } = await loadDefinitionFile(
      path.join(PLATFORM_ROLES_DIR, "backend-engineer.yaml"),
    );

    expect(isExecutableAllowed(spec, "pnpm")).toBe(true);
    // Not on the list, and a plausible thing for a model to reach for.
    expect(isExecutableAllowed(spec, "curl")).toBe(false);
  });

  it("parses §13's duration strings into milliseconds", async () => {
    const { spec } = await loadDefinitionFile(
      path.join(PLATFORM_ROLES_DIR, "backend-engineer.yaml"),
    );

    // `max_wall_clock: 45m`. Read as a bare number this would be 45 ms and every
    // run would time out immediately.
    expect(spec.budget.maxWallClockMs).toBe(45 * 60 * 1000);
  });

  it("names no model identifier in any definition", async () => {
    // ADR-004 owns the tier → model mapping. A model id in a YAML file moves the
    // decision out of the ADR and into a place nothing reviews.
    const loaded = await loadDefinitions(PLATFORM_ROLES_DIR);

    for (const { spec, source } of loaded) {
      expect(/sonnet|opus|haiku|fable|gpt-/i.test(JSON.stringify(spec)), source).toBe(false);
    }
  });
});

describe("a new role is added by authoring a file", () => {
  it("loads a role the loader has never heard of", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "atelier-newrole-"));
    try {
      await writeFile(
        path.join(directory, "database-engineer.yaml"),
        validYaml("database-engineer")
          .replace("can_migrate_schema: false", "can_migrate_schema: true")
          .replace("requires_approval_for: []", "requires_approval_for: [migrate]"),
        "utf8",
      );

      const loaded = await loadDefinitions(directory);

      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.spec.permissions.canMigrateSchema).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("an invalid spec is rejected at load", () => {
  it("rejects an unknown key rather than ignoring it", async () => {
    // The dangerous one. `can_depoly` silently ignored leaves `can_deploy`
    // absent — and a schema with defaults would have made that a granted
    // capability nobody wrote down.
    await expect(
      loadYaml("typo.yaml", validYaml("typo").replace("can_deploy:", "can_depoly:")),
    ).rejects.toThrow(/can_depoly|can_deploy/);
  });

  it("rejects camelCase written by mistake", async () => {
    // §13's format is snake_case. A camelCase key that fell through as unknown
    // would shadow nothing and leave the real permission unset.
    await expect(
      loadYaml("camel.yaml", validYaml("camel").replace("can_review:", "canReview:")),
    ).rejects.toThrow(InvalidAgentSpecError);
  });

  it("rejects a bash grant with no allowlist", async () => {
    // §13: bash is constrained, never raw. `- bash` on its own reads as "grant
    // bash", which is the thing that must never be expressible.
    await expect(
      loadYaml("rawbash.yaml", validYaml("rawbash").replace("  - edit", "  - bash")),
    ).rejects.toThrow(InvalidAgentSpecError);

    await expect(
      loadYaml(
        "emptybash.yaml",
        validYaml("emptybash").replace("  - edit", "  - bash:\n      allow: []"),
      ),
    ).rejects.toThrow(InvalidAgentSpecError);
  });

  it("rejects an agent that both writes and reviews code", async () => {
    await expect(
      loadYaml("both.yaml", validYaml("both").replace("can_review: false", "can_review: true")),
    ).rejects.toThrow(/review by a different agent/);
  });

  it("rejects a deploy permission with no approval requirement", async () => {
    // §17 Control 7: deploy is approval-gated and that is "not overridable by
    // configuration at any autonomy level". A file granting deploy with an empty
    // `requires_approval_for` is exactly the configuration §17 forbids.
    await expect(
      loadYaml("deploy.yaml", validYaml("deploy").replace("can_deploy: false", "can_deploy: true")),
    ).rejects.toThrow(/§17 Control 7/);
  });

  it("rejects a tier ADR-004 does not define", async () => {
    await expect(
      loadYaml("tier.yaml", validYaml("tier").replace("tier: implementation", "tier: planning")),
    ).rejects.toThrow(InvalidAgentSpecError);
  });

  it("rejects a model id where a tier belongs", async () => {
    await expect(
      loadYaml("modelid.yaml", validYaml("modelid").replace("tier: implementation", "tier: opus")),
    ).rejects.toThrow(InvalidAgentSpecError);
  });

  it("rejects a filename that disagrees with the id inside", async () => {
    // Two sources of truth for an agent's identity is one too many.
    await expect(loadYaml("mismatch.yaml", validYaml("something-else"))).rejects.toThrow(
      /but the file is named/,
    );
  });

  it("rejects a file that is not YAML at all", async () => {
    await expect(loadYaml("broken.yaml", "id: [unclosed\n")).rejects.toThrow(/not valid YAML/);
  });

  it("rejects a version of zero", async () => {
    await expect(
      loadYaml("zero.yaml", validYaml("zero").replace("version: 1", "version: 0")),
    ).rejects.toThrow(InvalidAgentSpecError);
  });

  it("rejects a bare number where a duration belongs", async () => {
    // `45` in a field documented as `45m` almost certainly means minutes, and
    // reading it as milliseconds would produce runs that die instantly.
    await expect(
      loadYaml("dur.yaml", validYaml("dur").replace("max_wall_clock: 10m", "max_wall_clock: 10")),
    ).rejects.toThrow(/duration/);
  });

  it("reports every problem in a file at once", async () => {
    // Fail-on-first turns a three-mistake file into three edit-and-retry cycles.
    let reported: unknown;
    try {
      await loadYaml(
        "many.yaml",
        validYaml("many")
          .replace("version: 1", "version: 0")
          .replace("max_retries: 1", "max_retries: -1")
          .replace("role: Test Role", "role: ''"),
      );
    } catch (error) {
      reported = error;
    }

    expect(reported).toBeInstanceOf(InvalidAgentSpecError);
    expect((reported as InvalidAgentSpecError).issues.length).toBeGreaterThanOrEqual(3);
  });

  it("names the file in the message", async () => {
    // The loader runs at boot. An error that does not say which of forty files
    // is wrong is an error someone has to bisect.
    await expect(
      loadYaml("named-file.yaml", validYaml("named-file").replace("version: 1", "version: 0")),
    ).rejects.toThrow(/named-file\.yaml/);
  });
});

describe("a directory of definitions", () => {
  it("refuses two files claiming the same agent id", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "atelier-dupe-"));
    try {
      await writeFile(path.join(directory, "dup.yaml"), validYaml("dup"), "utf8");
      // The filename check forces the id to match, so a duplicate needs a second
      // file whose name collides after the extension is stripped.
      await writeFile(path.join(directory, "dup.yml"), validYaml("dup"), "utf8");

      await expect(loadDefinitions(directory)).rejects.toThrow(/duplicate agent id/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails the whole load rather than loading what it can", async () => {
    // A partial registry means the orchestrator starts, accepts work, and fails
    // on whichever task needed the role that did not load.
    const directory = await mkdtemp(path.join(tmpdir(), "atelier-partial-"));
    try {
      await writeFile(path.join(directory, "fine.yaml"), validYaml("fine"), "utf8");
      await writeFile(path.join(directory, "bad.yaml"), "id: bad\n", "utf8");

      await expect(loadDefinitions(directory)).rejects.toThrow(InvalidAgentSpecError);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("ignores files that are not definitions", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "atelier-ignore-"));
    try {
      await writeFile(path.join(directory, "ok.yaml"), validYaml("ok"), "utf8");
      await writeFile(path.join(directory, "README.md"), "notes", "utf8");

      const loaded = await loadDefinitions(directory);
      expect(loaded.map((definition) => definition.spec.id)).toEqual(["ok"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
