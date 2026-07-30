// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidCapabilityPackError } from "@atelier/contracts";
import {
  PackNotFoundError,
  PackVersionMismatchError,
  indexPack,
  indexPacks,
  readPack,
  resolvePackVersion,
} from "./loader.js";
import { InvalidPackReferenceError, parsePackReference } from "./reference.js";

const CORPUS = fileURLToPath(new URL("../test-corpus/org/", import.meta.url));

let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "atelier-packs-"));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** Write a pack directory and index it. */
async function writePack(name: string, contents: string): Promise<string> {
  const directory = path.join(scratch, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), contents, "utf8");
  return directory;
}

const DESCRIPTION =
  "A sufficiently specific description of what this pack covers and when to use it.";

const frontmatter = (name: string, extra = ""): string =>
  `---
name: ${name}
description: ${DESCRIPTION}
${extra}---

# Body

Prose.
`;

describe("packs load", () => {
  it("reads frontmatter and reports the body size without reading the body", async () => {
    const entry = await indexPack(path.join(CORPUS, "clean-standards"), "org");

    expect(entry.name).toBe("clean-standards");
    expect(entry.version).toBe(3);
    expect(entry.description).toContain("conventions");
    expect(entry.bodyBytes).toBeGreaterThan(100);
    // The index is what sits in context permanently. If it carried the body,
    // progressive disclosure would be a comment rather than a property.
    expect(Object.hasOwn(entry, "body")).toBe(false);
  });

  it("indexes a whole corpus and reads a small fraction of its bytes", async () => {
    // The disclosure property, measured. Descriptions are what a prompt carries;
    // bodies are what it does not.
    const index = await indexPacks(CORPUS, "org");

    const descriptionBytes = index.reduce((sum, entry) => sum + entry.description.length, 0);
    const bodyBytes = index.reduce((sum, entry) => sum + entry.bodyBytes, 0);

    expect(index.length).toBeGreaterThan(5);
    expect(descriptionBytes).toBeLessThan(bodyBytes);
  });

  it("loads the body and every attachment on demand", async () => {
    const entry = await indexPack(path.join(CORPUS, "nested-injection"), "org");
    const pack = await readPack(entry);

    expect(pack.body).toContain("Release runbook");
    expect(pack.body.startsWith("---")).toBe(false);
    expect(pack.attachments.map((attachment) => attachment.file)).toEqual([
      "references/checklist.md",
    ]);
  });

  it("defaults an unversioned pack to version 1", async () => {
    // ADR-005 says frontmatter carries a version; the seed corpus predates that.
    // Defaulting is the honest reading of an unversioned document.
    const directory = await writePack("unversioned", frontmatter("unversioned"));
    const entry = await indexPack(directory, "platform");

    expect(entry.version).toBe(1);
  });

  it("keeps unknown frontmatter keys instead of refusing them", async () => {
    // The seed corpus carries argument-hint, auto-activate, user-invocable and
    // license in various combinations. Rejecting a pack over a key we do not read
    // would be strict about the wrong thing — a pack grants nothing.
    const directory = await writePack(
      "extra-keys",
      frontmatter("extra-keys", "argument-hint: [a thing]\nauto-activate: true\nlicense: MIT\n"),
    );

    await expect(indexPack(directory, "platform")).resolves.toMatchObject({ name: "extra-keys" });
  });

  it("skips a directory with no SKILL.md rather than failing", async () => {
    // A corpus root legitimately holds a README and, in skills/, per-pack
    // references/ folders.
    await mkdir(path.join(scratch, "not-a-pack"), { recursive: true });
    await writeFile(path.join(scratch, "not-a-pack", "notes.md"), "# notes\n", "utf8");

    const index = await indexPacks(scratch, "platform");
    expect(index.map((entry) => entry.name)).not.toContain("not-a-pack");
  });
});

describe("a malformed pack is rejected at load", () => {
  it("rejects a file with no frontmatter", async () => {
    const directory = await writePack("no-frontmatter", "# Just a document\n");
    await expect(indexPack(directory, "platform")).rejects.toThrow(/frontmatter/);
  });

  it("rejects an unclosed frontmatter block", async () => {
    const directory = await writePack("unclosed", "---\nname: unclosed\n\n# Body\n");
    await expect(indexPack(directory, "platform")).rejects.toThrow(/not closed/);
  });

  it("rejects a description too vague to decide relevance from", async () => {
    // The disclosure decision is made from the description alone. A vague one
    // means the pack is either never loaded or always loaded, and both defeat the
    // mechanism.
    const directory = await writePack(
      "vague",
      "---\nname: vague\ndescription: Some helpful stuff.\n---\n\n# Body\n",
    );
    await expect(indexPack(directory, "platform")).rejects.toThrow(InvalidCapabilityPackError);
  });

  it("rejects a name that disagrees with the directory", async () => {
    const directory = await writePack("on-disk", frontmatter("in-frontmatter"));
    await expect(indexPack(directory, "platform")).rejects.toThrow(/but the directory is/);
  });

  it("rejects frontmatter that is not valid YAML", async () => {
    const directory = await writePack("bad-yaml", "---\nname: [unclosed\n---\n\n# Body\n");
    await expect(indexPack(directory, "platform")).rejects.toThrow(/not valid YAML/);
  });
});

describe("references resolve to a version", () => {
  it("parses scope, name and optional version", () => {
    expect(parsePackReference("platform/api-design")).toEqual({
      scope: "platform",
      name: "api-design",
    });
    expect(parsePackReference("org/our-conventions@4")).toEqual({
      scope: "org",
      name: "our-conventions",
      version: 4,
    });
  });

  it("refuses a reference with no scope", () => {
    // A resolver that guessed the scope would let an org pack shadow a platform
    // pack by naming a directory the same thing.
    expect(() => parsePackReference("api-design")).toThrow(InvalidPackReferenceError);
    expect(() => parsePackReference("internal/api-design")).toThrow(InvalidPackReferenceError);
  });

  it("resolves an unversioned reference to what is on disk", async () => {
    const index = await indexPacks(CORPUS, "org");
    const resolved = resolvePackVersion(index, { scope: "org", name: "clean-standards" });

    expect(resolved.version).toBe(3);
  });

  it("resolves a pinned reference only to that exact version", async () => {
    const index = await indexPacks(CORPUS, "org");

    expect(
      resolvePackVersion(index, { scope: "org", name: "clean-standards", version: 3 }).version,
    ).toBe(3);
  });

  it("refuses to substitute a different version for a pinned one", async () => {
    // §13 rule 6: pack versions are pinned and recorded so a run from six weeks
    // ago can be explained. Serving v3 to a run pinned at v2 turns that record
    // into a plausible-looking fiction — the worst kind, because it still
    // explains the run, just not the one that happened.
    const index = await indexPacks(CORPUS, "org");

    expect(() =>
      resolvePackVersion(index, { scope: "org", name: "clean-standards", version: 2 }),
    ).toThrow(PackVersionMismatchError);
    expect(() =>
      resolvePackVersion(index, { scope: "org", name: "clean-standards", version: 2 }),
    ).toThrow(/has version 3/);
  });

  it("refuses a pack that does not exist", async () => {
    const index = await indexPacks(CORPUS, "org");

    expect(() => resolvePackVersion(index, { scope: "org", name: "imaginary" })).toThrow(
      PackNotFoundError,
    );
  });

  it("does not resolve an org reference against the platform index", async () => {
    const index = await indexPacks(CORPUS, "org");

    // Same name, different scope. Scope is part of the identity precisely so this
    // cannot silently succeed.
    expect(() => resolvePackVersion(index, { scope: "platform", name: "clean-standards" })).toThrow(
      PackNotFoundError,
    );
  });
});
