import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  InvalidCapabilityPackError,
  parseCapabilityPackFrontmatter,
  type CapabilityPackFrontmatter,
} from "@atelier/contracts";
import { formatPackReference, type PackReference, type PackScope } from "./reference.js";

/**
 * Loading `SKILL.md` packs, progressively (ADR-005, M025).
 *
 * The whole point of the format is that **the description sits in context and
 * the body does not**. So this module has two operations that must stay
 * separate:
 *
 *   `indexPacks`  reads frontmatter only — cheap, safe to run over the whole
 *                 corpus on every boot, and the thing an agent's prompt carries.
 *   `readPack`    reads the body and its attachments — done when the task calls
 *                 for it, and never speculatively.
 *
 * If `indexPacks` read bodies, progressive disclosure would be a comment rather
 * than a property: the cost would already have been paid by the time anything
 * decided the pack was irrelevant. It reads a bounded prefix of each file for
 * exactly that reason, and a test asserts the index carries no body.
 */

/**
 * How much of a file to read when looking for frontmatter.
 *
 * Generous for a YAML block and tiny next to a pack body — the largest
 * description in the seed corpus is around 1 KB. A pack whose frontmatter does
 * not close within this is malformed, and saying so beats reading a 200 KB file
 * to find out.
 */
const FRONTMATTER_READ_LIMIT = 8192;

/**
 * The frontmatter block, line-ending agnostic.
 *
 * `\r?\n` everywhere is not defensive padding. Splitting on `"\n---"` and slicing
 * up to it leaves the preceding `\r` attached to the last value, so a CRLF pack
 * parses `version: 3` as the string `"3\r"` and fails validation with "expected
 * number, received string" — which reads like a malformed pack rather than a
 * loader bug. Every pack authored on Windows, and every file in a working tree
 * checked out with `core.autocrlf`, hits this.
 *
 * Non-greedy, so the first closing fence wins rather than the last one in the
 * document.
 */
const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const OPENING_FENCE = /^---[ \t]*\r?\n/;

export type PackIndexEntry = {
  readonly reference: PackReference;
  readonly name: string;
  /** The only part of a pack that permanently occupies context. */
  readonly description: string;
  readonly version: number;
  readonly requestsTools: readonly string[];
  /** Directory containing `SKILL.md`. */
  readonly directory: string;
  /** Body size in bytes, for budget accounting before deciding to load it. */
  readonly bodyBytes: number;
};

export type LoadedPack = PackIndexEntry & {
  readonly body: string;
  /**
   * Reference documents the pack loads on demand.
   *
   * Indexed here because they are part of the pack's attack surface: §13's
   * nested-injection case is a payload in `references/*.md` that `SKILL.md`
   * itself does not contain, so the scanner must see them or it is checking the
   * cover page of a book.
   */
  readonly attachments: readonly { readonly file: string; readonly text: string }[];
};

/** Split a document into its frontmatter block and the rest. */
function splitFrontmatter(text: string, source: string): { yaml: string; bodyOffset: number } {
  if (!OPENING_FENCE.test(text)) {
    throw new InvalidCapabilityPackError(source, [
      { path: "(root)", message: "must begin with a `---` YAML frontmatter block" },
    ]);
  }

  const match = FRONTMATTER.exec(text);
  if (match === null) {
    throw new InvalidCapabilityPackError(source, [
      { path: "(root)", message: "frontmatter block is not closed by `---`" },
    ]);
  }

  return { yaml: match[1] ?? "", bodyOffset: match[0].length };
}

function parseFrontmatter(yaml: string, source: string): CapabilityPackFrontmatter {
  let document: unknown;
  try {
    document = parseYaml(yaml);
  } catch (error) {
    throw new InvalidCapabilityPackError(source, [
      { path: "(root)", message: `frontmatter is not valid YAML: ${(error as Error).message}` },
    ]);
  }
  return parseCapabilityPackFrontmatter(document, source);
}

/**
 * Index one pack directory: frontmatter only.
 *
 * Reads a bounded prefix rather than the file. The seed corpus is ~1.5 MB across
 * 34 packs, and reading all of it to build an index that uses 3% of it is the
 * cost progressive disclosure exists to avoid.
 */
export async function indexPack(directory: string, scope: PackScope): Promise<PackIndexEntry> {
  const file = path.join(directory, "SKILL.md");
  const source = `${path.basename(directory)}/SKILL.md`;

  const handle = await open(file, "r");
  let prefix: string;
  let size: number;
  try {
    const stats = await handle.stat();
    size = stats.size;
    const buffer = Buffer.alloc(Math.min(FRONTMATTER_READ_LIMIT, size));
    await handle.read(buffer, 0, buffer.length, 0);
    prefix = buffer.toString("utf8");
  } finally {
    await handle.close();
  }

  const { yaml, bodyOffset } = splitFrontmatter(prefix, source);
  const frontmatter = parseFrontmatter(yaml, source);

  // The directory name is the identity, exactly as with agent definitions: two
  // sources of truth for a name is one too many, and a pack whose frontmatter
  // disagrees with its path is unfindable later.
  const expected = path.basename(directory);
  if (frontmatter.name !== expected) {
    throw new InvalidCapabilityPackError(source, [
      { path: "name", message: `is "${frontmatter.name}" but the directory is "${expected}"` },
    ]);
  }

  return {
    reference: { scope, name: frontmatter.name, version: frontmatter.version },
    name: frontmatter.name,
    description: frontmatter.description,
    version: frontmatter.version,
    requestsTools: frontmatter["requests-tools"] ?? [],
    directory,
    bodyBytes: size - bodyOffset,
  };
}

/**
 * Index every pack under a root.
 *
 * A directory with no `SKILL.md` is skipped rather than failing: a corpus root
 * legitimately contains a README and, in `skills/`, per-pack `references/`
 * folders. A directory that HAS a `SKILL.md` and is malformed still fails —
 * being lenient there is how a broken pack goes unnoticed until an agent needs
 * it.
 */
export async function indexPacks(
  root: string,
  scope: PackScope,
): Promise<readonly PackIndexEntry[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .toSorted((a, b) => a.localeCompare(b));

  const indexed: PackIndexEntry[] = [];
  for (const directory of directories) {
    if (!(await hasSkillFile(directory))) continue;
    indexed.push(await indexPack(directory, scope));
  }
  return indexed;
}

async function hasSkillFile(directory: string): Promise<boolean> {
  try {
    const stats = await stat(path.join(directory, "SKILL.md"));
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Load a pack's body and every markdown document it ships.
 *
 * Attachments are collected recursively because that is how the pack is actually
 * consumed — `SKILL.md` says "read `references/threat-model.md`" and the agent
 * does. A scanner that looked only at `SKILL.md` would miss the case §13 calls
 * out by name.
 */
export async function readPack(entry: PackIndexEntry): Promise<LoadedPack> {
  const file = path.join(entry.directory, "SKILL.md");
  const text = await readFile(file, "utf8");
  const { bodyOffset } = splitFrontmatter(text, `${entry.name}/SKILL.md`);

  const attachments: { file: string; text: string }[] = [];
  const documents = await markdownUnder(entry.directory);
  for (const relative of documents) {
    if (relative === "SKILL.md") continue;
    attachments.push({
      file: relative,
      text: await readFile(path.join(entry.directory, relative), "utf8"),
    });
  }

  return { ...entry, body: text.slice(bodyOffset), attachments };
}

async function markdownUnder(root: string, prefix = ""): Promise<readonly string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const found: string[] = [];
  const sorted = entries.toSorted((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await markdownUnder(root, relative)));
    } else if (/\.mdx?$/.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

/**
 * A pinned reference does not match what is on disk.
 *
 * Loud rather than a fallback. §13 requires a run to be reproducible from its
 * recorded pack versions, and quietly serving v4 to a run pinned at v3 turns
 * that record into a plausible-looking fiction — the worst kind, because it
 * still explains the run, just not the one that happened.
 */
export class PackVersionMismatchError extends Error {
  constructor(reference: PackReference, found: number) {
    super(
      `${formatPackReference(reference)} was requested but the corpus has version ${found}. ` +
        `A pinned pack version is never substituted — restore the version or re-pin the run.`,
    );
    this.name = "PackVersionMismatchError";
  }
}

export class PackNotFoundError extends Error {
  constructor(reference: PackReference) {
    super(`no capability pack ${formatPackReference(reference)} in the corpus`);
    this.name = "PackNotFoundError";
  }
}

/**
 * Resolve one reference against an index.
 *
 * Unversioned resolves to what is there. Versioned resolves only to that exact
 * version.
 */
export function resolvePackVersion(
  index: readonly PackIndexEntry[],
  reference: PackReference,
): PackIndexEntry {
  const candidates = index.filter(
    (entry) => entry.reference.scope === reference.scope && entry.name === reference.name,
  );

  if (candidates.length === 0) throw new PackNotFoundError(reference);

  if (reference.version === undefined) {
    // Highest version wins when a corpus carries several. One is the normal case
    // — packs are Git-versioned, so history lives in Git rather than on disk.
    return candidates.reduce((best, entry) => (entry.version > best.version ? entry : best));
  }

  const exact = candidates.find((entry) => entry.version === reference.version);
  if (exact === undefined) {
    const found = candidates.reduce((best, entry) => (entry.version > best.version ? entry : best));
    throw new PackVersionMismatchError(reference, found.version);
  }
  return exact;
}
