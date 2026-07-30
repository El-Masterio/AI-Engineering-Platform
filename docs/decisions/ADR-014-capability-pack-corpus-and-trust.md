# ADR-014 — The capability-pack corpus is rooted at `skills/`, and platform packs are trusted

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Lead Architect (M025 implementation)

## Context

[ADR-005](ADR-005-skills-as-capability-format.md) chose `SKILL.md` as the capability-pack format and
named the 34 packs in [`skills/`](../../skills/) as the seed corpus. It sketched the layout as:

```
capability packs
├── platform/          ours; versioned with the product; seeded from skills/
└── org/               customer-authored; untrusted; scanned before use
```

[§19](../04-engineering/19-folder-structure.md) turned that sketch into a path —
`packages/capability-packs/platform/<name>/SKILL.md`, "our maintained corpus (seeded from
`skills/`)". M025 had to make it real, and "seeded from" turned out to be the load-bearing phrase:
seeded once and then diverging, or seeded continuously and therefore duplicated?

Two further questions were unanswered by ADR-005 and had to be settled before the scanner could work
at all:

1. ADR-005's security rules say a pack is "scanned for prompt injection before entering any agent
   context". Does that include *our own* packs? `skills/skill-security-audit/SKILL.md` teaches
   injection detection, so it contains every attack string it teaches about. Scanned as untrusted
   input, our own corpus fails.
2. Should a pattern inside a fenced code block score lower than the same pattern as a bare line? It
   is the obvious way to make (1) go away.

## Options considered

### The corpus location

| Option | Assessment |
|---|---|
| **A — Copy curated packs into `packages/capability-packs/platform/`**, as §19 draws it | Matches the documented structure. Creates a second copy of ~1.5 MB of prose. The two diverge the moment either is edited, and nothing detects it — a developer improving `skills/security` while agents keep reading the stale copy is a silent failure with no symptom other than worse output. |
| **B — Root the corpus at `skills/`, curated by an explicit manifest** | One corpus, two consumers. CLAUDE.md already states those packs "are also the intended packaging format for in-product agent capabilities". Needs a manifest, because `skills/` also holds developer tooling (`youtube-thumbnail-maker`, `upwork-proposal`, `know-me`) that is not product content. Deviates from §19's drawn path. |
| **C — Build-time sync from `skills/` into the package** | Removes drift *if the sync runs*. Adds a build step whose failure mode is a stale corpus that looks fresh — the same silent failure as A, with more machinery. |

### The trust boundary

| Option | Assessment |
|---|---|
| **D — Scan every pack, platform included** | Uniform, and refuses our own corpus. Would force us to either drop `skill-security-audit` (which §13 names as the seed of this scanner) or tune the rules until they stop detecting the patterns that pack documents — degrading the scanner to make a self-check pass. |
| **E — Scan org packs only; platform packs are trusted content** | Matches what ADR-005's security rules actually say: the subject of that section is "a customer-authored pack". Platform packs are ours, reviewed in Git, and change through the same review as code. |

### Context downgrade in the scanner

| Option | Assessment |
|---|---|
| **F — Downgrade patterns inside code fences and table cells** | Cuts false positives sharply, including on `skill-security-audit`. **Unsound:** the agent reads the whole document, fences included, so a payload inside a fence reaches the model exactly as one outside it does. Any rule an attacker satisfies by typing three backticks is not a rule. |
| **G — No context downgrade; handle documentation packs by trust** | Keeps every rule honest. Accepts that a pack teaching injection detection trips the scanner, which is a *true* positive by the scanner's own definition. |

## Decision

**B, E, and G.**

1. **`PLATFORM_CORPUS_ROOT` is `skills/`.** The curated subset is `PLATFORM_PACKS` in
   `packages/capability-packs/src/platform-corpus.ts` — 15 packs, each with a written reason, the
   same discipline as `NON_TENANT_TABLES` in the db package. The loader indexes those directories by
   name rather than listing the root, so the 19 packs we do not ship are never parsed.

   This **supersedes §19's `packages/capability-packs/platform/` path.** §19 is amended to describe
   the manifest instead.

2. **Platform packs are trusted content and are not scanned as untrusted input.** Org packs are
   scanned, and a `critical` finding refuses the pack.

3. **The scanner applies no context downgrade.** A pattern in a fence scores what it scores anywhere.
   `skill-security-audit` therefore produces critical findings, recorded in
   `EXPECTED_CRITICAL_FINDINGS` with a reason — and a test pins that set, so **any other platform
   pack producing a critical finding fails the build.** That is the property worth having: not "our
   corpus is clean" but "we would notice if it stopped being".

Two smaller decisions recorded here rather than discovered later:

- **`version` in frontmatter is optional and defaults to 1.** ADR-005 says frontmatter carries a
  version; the seed corpus predates that and carries none. Defaulting is the honest reading of an
  unversioned document, and the 34 files are also in daily use as developer tooling, so rewriting
  them to satisfy a schema would be the wrong direction of pressure. Version *resolution* is still
  strict: a pinned reference that does not match what is on disk is an error, never a substitution
  (§13 rule 6 — a run from six weeks ago must be explainable).

- **Pack frontmatter is validated permissively; agent specs strictly.** An agent spec grants
  capability, so an unrecognised key there is a permission nobody reviewed. A pack grants nothing, and
  the seed corpus already carries `argument-hint`, `auto-activate`, `user-invocable` and `license` in
  various combinations. Refusing a pack over a key we do not read would be strict about the wrong
  thing.

## Consequences

**Positive**

- One corpus. Improving a pack improves it for developers and for agents in the same commit, and there
  is no sync step to forget.
- The curation list is reviewable: adding a pack to the product is a diff with a reason in it.
- The scanner stays sound. No rule can be defeated by formatting.
- A new platform pack carrying an injection is a build failure, not a discovery.

**Negative**

- §19's drawn path is now wrong and had to be amended. A reader who trusts the diagram over the ADR
  will look in the wrong place.
- `skills/` now has two audiences with different standards. A pack added for personal use is fine; a
  pack added to `PLATFORM_PACKS` is product content and needs product-quality prose. Nothing enforces
  that beyond review.
- The trust asymmetry is a real risk surface: a platform pack is never scanned, so a compromised
  commit to `skills/` reaches agent context with only code review between it and production. The
  pinning test narrows this to "an injection that no rule names", which is the same residual risk §17
  already accepts for every other channel.
- One of the 34 packs (`youtube-broll-maker`) has frontmatter that is not valid YAML. It is not
  product content and is not parsed, but it means the corpus root is not uniformly loadable — a
  whole-root index would fail on it.

**Neutral**

- The `org/` scope has no storage yet; M070 adds the registry. Until then org packs come from a
  directory, which is what the test corpus uses.

## Reversal cost

**Low.** Moving to option A is a copy plus a path change. The trust decision (E) is one branch in
`assembleCapabilities`. Reversing G — adding a context downgrade — is also small and would be a
mistake for the reason stated above.

## Revisit triggers

- **A platform pack is edited without review.** The trust assumption in E is exactly "reviewed in
  Git". If `skills/` ever becomes writable by anything other than a reviewed commit, platform packs
  must be scanned like any other input.
- **`skills/` grows a pack that is product content and personal tooling at once.** That is the point
  where one directory with two audiences stops working and option A becomes correct.
- **A successful injection through an org pack** — ADR-005 already lists this as one of its own
  triggers. The response is to add the pattern *and* to check what the capability ceiling actually
  prevented, because the ceiling is what was supposed to hold.
- **The marketplace (M132).** Third-party packs are neither ours nor the customer's, and this ADR's
  two-way trust split does not describe them.

## Related

- [ADR-005](ADR-005-skills-as-capability-format.md) — chose the format and named the seed corpus
- [ADR-013](ADR-013-agent-definitions-as-per-tenant-data.md) — the specs that reference these packs
- [§13 Agent Architecture](../02-architecture/13-agent-architecture.md) — capability packs, §13 rule 6
- [§17 Security Strategy](../02-architecture/17-security-strategy.md) — Control 4, prompt injection
- [§19 Folder Structure](../04-engineering/19-folder-structure.md) — amended by decision 1
