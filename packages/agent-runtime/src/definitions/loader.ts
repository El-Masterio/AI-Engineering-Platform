import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { InvalidAgentSpecError, parseAgentSpecFile } from "@atelier/contracts";
import type { AgentSpec } from "../spec.js";

/**
 * Load agent definitions from files (M024).
 *
 * The acceptance criterion is "a new role is added by authoring a file with no
 * code change", so this module is deliberately the only thing between a `.yaml`
 * on disk and a registered agent. There is no registry array to append to and no
 * switch statement to extend — a directory listing is the registry.
 *
 * That only stays safe because the file is validated hard. `parseAgentSpecFile`
 * refuses unknown keys, refuses a bash grant with no allowlist, and refuses the
 * structural combinations §13 forbids. A permissive loader would turn "no code
 * change" from a feature into a way to grant a capability by typo.
 */

/**
 * Where the platform's own six roles live.
 *
 * `../../roles/` resolves to the same directory from `src/definitions/` and from
 * `dist/definitions/`, which is why the corpus sits at the package root rather
 * than inside `src/`. `tsc` does not copy `.yaml`, so a corpus under `src/`
 * would need a build step that copies it — and the failure mode of forgetting
 * that step is an empty registry at runtime and a green build.
 */
export const PLATFORM_ROLES_DIR = fileURLToPath(new URL("../../roles/", import.meta.url));

export type LoadedDefinition = {
  readonly spec: AgentSpec;
  /** The file it came from, for error messages and for the audit record. */
  readonly source: string;
};

/**
 * Read one definition file.
 *
 * The filename must match the `id` inside. Two sources of truth for an agent's
 * identity is one too many: a `backend-engineer.yaml` declaring
 * `id: frontend-engineer` would load, work, and be impossible to find later.
 */
export async function loadDefinitionFile(filePath: string): Promise<LoadedDefinition> {
  const source = path.basename(filePath);
  const contents = await readFile(filePath, "utf8");

  let document: unknown;
  try {
    document = parseYaml(contents);
  } catch (error) {
    // A YAML syntax error is not a schema problem, and reporting it as one sends
    // the author looking at the wrong thing.
    throw new InvalidAgentSpecError(source, [
      { path: "(root)", message: `not valid YAML: ${(error as Error).message}` },
    ]);
  }

  const spec = parseAgentSpecFile(document, source);

  const expectedId = source.replace(/\.ya?ml$/, "");
  if (spec.id !== expectedId) {
    throw new InvalidAgentSpecError(source, [
      { path: "id", message: `is "${spec.id}" but the file is named "${expectedId}.yaml"` },
    ]);
  }

  return { spec, source };
}

/**
 * Read every definition in a directory.
 *
 * Fails on the first bad file rather than loading what it can. A partial agent
 * registry is worse than none: the orchestrator would start, accept work, and
 * fail on whichever task happened to need the role that did not load.
 */
export async function loadDefinitions(
  directory: string = PLATFORM_ROLES_DIR,
): Promise<readonly LoadedDefinition[]> {
  const entries = await readdir(directory);
  const files = entries
    .filter((entry) => /\.ya?ml$/.test(entry))
    .toSorted((a, b) => a.localeCompare(b));

  const loaded: LoadedDefinition[] = [];
  for (const file of files) {
    loaded.push(await loadDefinitionFile(path.join(directory, file)));
  }

  // Duplicate ids cannot happen within one directory — the filename is the id
  // and a filesystem enforces that — but they can across directories once an
  // organization contributes its own, so the check is here rather than assumed.
  const seen = new Set<string>();
  for (const definition of loaded) {
    if (seen.has(definition.spec.id)) {
      throw new InvalidAgentSpecError(definition.source, [
        { path: "id", message: `duplicate agent id "${definition.spec.id}"` },
      ]);
    }
    seen.add(definition.spec.id);
  }

  return loaded;
}
