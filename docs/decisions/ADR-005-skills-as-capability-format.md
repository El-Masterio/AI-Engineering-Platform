# ADR-005 — `SKILL.md` as the agent capability-pack format

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Lead Architect (blueprint phase)

## Context

An agent's expertise has to live somewhere. The obvious place is its system prompt, but that fails on
four counts:

1. **It doesn't scale.** Nineteen roles × deep domain knowledge is far more text than fits in a prompt,
   and paying to load all of it on every run is wasteful.
2. **It isn't extensible by customers.** The platform thesis (§1, §29) requires organizations to encode
   *their* standards and have every agent inherit them. That is impossible if expertise is baked into
   our prompts.
3. **It isn't versionable independently.** A change to review standards shouldn't require redeploying
   the application.
4. **It isn't reusable across roles.** API conventions matter to Backend Engineer, Architect, and Code
   Reviewer alike.

We also have a relevant asset: 34 existing capability packs in [`skills/`](../../skills/) —
`api-design`, `backend-engineering`, `code-review-standards` (13 languages), `security`, `scalability`,
`observability`, `docker`, `ci-cd-devops`, `frontend-engineering`, `software-architecture`,
`skill-security-audit`, and more. These were authored as developer tooling but are directly reusable as
product content.

## Options considered

### Option A — Expertise in system prompts

| | |
|---|---|
| **Advantages** | Simplest. No loader, no registry, no versioning. |
| **Disadvantages** | Fails all four requirements above. Prompt bloat is the observed failure mode — instructions accrete to patch individual failures until the prompt contradicts itself. |
| **Future-proofing** | Poor. Forecloses the platform strategy entirely. |

### Option B — Structured data (JSON/YAML rules engine)

| | |
|---|---|
| **Advantages** | Machine-validatable; queryable; unambiguous. |
| **Disadvantages** | Engineering expertise is largely *prose* — judgment, trade-offs, worked examples. Forcing it into a rule schema loses exactly the nuance that makes it useful. Customers authoring standards would have to learn our schema rather than writing what they'd write in a wiki. |
| **Future-proofing** | Poor fit for the content. |

### Option C — Markdown documents with frontmatter (`SKILL.md`), progressively disclosed

| | |
|---|---|
| **Advantages** | Prose is the right medium for engineering judgment. Frontmatter gives machine-readable metadata (name, description, triggers, version). **Progressive disclosure** — the description sits in context; the full document is read only when relevant — keeps prompts small and cost low. Customers author in Markdown, which they already know. Composable across roles. Versionable in Git. Reviewable in a diff. Directly supported by the agent runtime. **We already have 34 of them.** |
| **Disadvantages** | Unstructured prose can be vague or self-contradictory; quality depends on authoring discipline. Untrusted customer-authored content is a prompt-injection surface. No schema to validate the *content* against. |
| **Scalability** | Excellent — progressive disclosure means the corpus can grow without growing context. |
| **Community** | An established convention rather than a bespoke format. |
| **Maintenance** | Medium — the corpus needs curation and periodic pruning. |
| **Cost** | Low; progressive disclosure keeps token cost proportional to relevance. |
| **Future-proofing** | Strong; enables org packs, marketplace, and self-improvement without format change. |

## Decision

**`SKILL.md` — Markdown with YAML frontmatter — is the capability-pack format, for both
platform-provided and customer-authored packs.**

```
capability packs
├── platform/          ours; versioned with the product; seeded from skills/
└── org/               customer-authored; untrusted; scanned before use
```

Frontmatter carries `name`, `description` (used for disclosure decisions), `version`, and optional
trigger hints. The body is prose, tables, and examples.

### Security rules — non-negotiable

A customer-authored pack is **untrusted content that influences agent behavior**. Therefore:

1. **Scanned for prompt injection before entering any agent context** (M025). The
   `skill-security-audit` pack in `skills/` is the seed of that scanner.
2. **A pack can never grant a tool the agent's allowlist doesn't already have.** Capability is granted
   by the agent specification, never by a document. This is the ceiling that makes untrusted packs
   safe to allow at all.
3. **Structurally marked as data, not instructions**, in the assembled prompt.
4. Marketplace packs additionally require sandboxed evaluation and publisher verification before
   listing (M132).

## Consequences

### Positive

- **This is the platform thesis made operational.** An agency encodes "how we build things here" once,
  and every agent on every project enforces it. That is a retention mechanism built *for* the customer
  rather than a lock-in built against them.
- Adding agent role #20 is authoring documents, not writing a subsystem.
- The 34 existing packs are an immediate head start on the platform corpus — real content, not a
  bootstrap problem.
- Progressive disclosure keeps prompts small, which keeps cost down and cache stability high.
- Packs are Git-versioned and diff-reviewable, so a standards change goes through review like code.
- Enables the marketplace (M132) and human-reviewed self-improvement (§29) without a format change.

### Negative

- Untrusted content in an agent context is a permanent prompt-injection surface. Mitigated by the
  capability ceiling, not eliminated — an injected instruction still cannot grant a tool.
- Pack quality varies. A vague or self-contradictory pack degrades agent behavior in ways that are hard
  to attribute.
- Prompt/pack debt is real and needs active management: bloat, contradictions, and stale
  model-specific workarounds all accumulate. §28 records the controls.
- Requires an eval suite to detect whether a pack change actually helps — otherwise pack edits are
  unfalsifiable opinion.

### Neutral

- The platform corpus becomes a maintained content asset, which is a different kind of work than code.

## Reversal cost

**Medium.** The format is Markdown, so content is portable. Changing to a structured format would
require rewriting the corpus and the loader, but the *concept* (versioned, composable, progressively
disclosed capability documents) would survive.

## Revisit triggers

- Injection scanning proving insufficient — i.e. a successful injection via a pack in the adversarial
  suite or in production.
- Pack quality variance measurably degrading output across organizations.
- A need for machine-verifiable rules that prose cannot express (e.g. a compliance rule that must be
  provably enforced rather than described).

## Related

- [§13 Agent Architecture](../02-architecture/13-agent-architecture.md)
- [§17 Security Strategy](../02-architecture/17-security-strategy.md)
- [§29 Future Expansion](../05-delivery/29-future-expansion.md)
- [`skills/`](../../skills/) — the 34-pack seed corpus
- Backlog M025, M070, M071, M131, M132
