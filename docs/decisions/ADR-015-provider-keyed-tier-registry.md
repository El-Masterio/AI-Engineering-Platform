# ADR-015 — The tier registry is keyed by provider, and resolution returns a whole request

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Project owner (provider strategy); Lead Architect (M034 implementation)

## Context

[ADR-004](ADR-004-model-tiering.md) chose four named tiers "resolved at runtime from a single mapping
table", with the rule that "no model ID appears anywhere else in the codebase — enforced by lint".
M034 implements it. Two things have changed since ADR-004 was written, and both bear on how.

**1. A second provider is now planned.** M026 is the point [ADR-002](ADR-002-managed-agents-runtime.md)
named for validating its own bet, and the owner was asked whether to proceed on Claude Managed Agents
or switch to the OpenRouter-primary/Groq-failover plan. The decision was **keep both**: build the
managed runtime as specified, and add an adapter for a second provider behind the same
[ADR-012](ADR-012-agent-runtime-port.md) port, which must pass the same conformance suite. ADR-004's
"single mapping table" was written when Anthropic was the only provider.

**2. Tier membership turns out to carry more than a model name.** While implementing the table against
the authoritative `claude-api` capability pack, four per-model request constraints surfaced that a
`{ tier → model }` map cannot express:

- The utility tier's model **rejects the `effort` parameter outright**. ADR-004 writes "n/a" in that
  cell, and that is literal rather than "unspecified" — sending a default would 400 on every call.
- The reasoning tier's model accepts an explicit *disabled-thinking* request at `high` effort or below
  and **returns 400 for the same request at `xhigh`**, validated per request.
- The frontier tier's model rejects **any** explicit thinking configuration, including the adaptive one
  that is correct on the other three.
- Sampling parameters (`temperature`, `top_p`, `top_k`) are rejected on all four.

Also relevant: the utility tier is the only one that is not 128K output / 1M context, and the minimum
cacheable prefix differs per tier and is **not monotonic** across generations.

## Options considered

### How the registry is keyed

| Option | Assessment |
|---|---|
| **A — one flat table, add a provider dimension when needed** | Matches ADR-004's wording today. Retrofitting the provider key later means touching every call site — precisely the repository-wide edit ADR-004 exists to prevent, and it would arrive at the moment we are already doing the risky work of adding a provider. |
| **B — keyed by provider from the start** | One extra lookup argument, defaulted, so today's call sites read the same. The second provider becomes a new table rather than a refactor. |

### What resolution returns

| Option | Assessment |
|---|---|
| **C — `{ model, effort }`** | Smallest surface. Every caller then needs the four constraints above in its head; the first adapter to forget one sends `effort` to the utility tier and 400s on every request. Model-specific knowledge leaks out of the table, which defeats the table. |
| **D — a complete, valid request shape** | The resolver returns the model, whether to send `effort` at all, which thinking form to use, the output ceiling, the cache minimum, and the beta flags. Slightly wider type; the constraints stay where the model IDs are. |

## Decision

**B and D.**

1. **`tierRegistry(provider)` and `tierEntry(tier, provider)`**, both defaulting to `anthropic`.
   `packages/agent-runtime/src/models/registry.ts` is the only file in the repository permitted to
   contain a model identifier.

2. **`resolveModel(tier, effort, provider)` returns a `ResolvedModel`** carrying the whole request
   shape. `effort: null` means *omit the parameter*, which is a different request from any default;
   `thinking: "omit"` likewise.

3. **A requested effort a tier cannot express is an error, not a clamp** — except on the tier whose
   model rejects the parameter, where it is dropped and reported as `droppedEffort`. Clamping would run
   at a level the specification did not ask for while the specification still recorded the original,
   and §13 rule 6 requires a run to be explainable from what was recorded.

4. **The lint rule is spread into every `no-restricted-syntax` block**, not declared once repo-wide.
   ESLint flat config *replaces* a rule's options rather than merging them, so a later repo-wide block
   silently disables every scoped selector below it. The first version of this rule did exactly that —
   it turned off §18's hardcoded-colour guard for `packages/ui` and `apps/web`, and the only visible
   symptom was two disable comments becoming unused. Two files are exempt by path, each with a written
   reason: the registry itself, and M023's purity test, which contains the string in order to forbid
   it.

5. **Refusal fallback is requested as `"default"`, not as a pinned model.** ADR-004 control 5 wants the
   fallback configured; the right substitute depends on *why* the request was declined, since different
   models carry different classifiers, and naming one creates a migration when that model retires.

**ASSUMPTION-010 is resolved.** ADR-004's prices were re-verified on 2026-07-30 against the
`claude-api` capability pack (cached 2026-06-24), which CLAUDE.md makes authoritative over recalled API
details. All four tiers match as authored. This is a **documentary** verification, not a live one: no
API credentials exist in the build environment, so it confirms the ADR agrees with our authoritative
reference rather than with a billing system.

## Consequences

**Positive**

- A model launch is a diff to one table plus an eval run, which is what ADR-004 promised. A test reads
  ADR-004's own decision table and fails if the registry drifts from it — including on price.
- The four request constraints are stated once, next to the identifiers they belong to, instead of
  being rediscovered by each adapter as a 400.
- Adding the second provider is additive. Nothing that resolves a tier today changes.
- An expired introductory price now fails a test rather than quietly understating COGS.

**Negative**

- `ResolvedModel` is a wider type than `{ model, effort }`, and every field is one more thing a second
  provider's table must supply. That is the cost of not leaking the constraints, and it is paid once
  per provider rather than once per call site.
- The lint rule is duplicated across five config blocks. Flat config's replace-not-merge semantics make
  that necessary, and the comment says so — but a future block that forgets the spread will silently
  disable the rule for its files. The same hazard already applies to `TSEnumDeclaration`.
- Per-provider tier tables invite divergence: two providers could disagree about what "reasoning"
  means. The conformance suite constrains behaviour, not tier semantics.

**Neutral**

- Prices are integers in hundredths of a cent per million tokens, matching the cost package's
  no-floating-point rule.

## Reversal cost

**Low.** The registry is one file, the resolver another, and the provider argument is defaulted
everywhere. Collapsing back to a flat table would be a mechanical edit.

## Revisit triggers

- **The second provider's models do not partition into these four tiers.** Then the tier vocabulary
  itself is the wrong abstraction, not the table — and that contradicts ADR-004's core decision rather
  than extending it.
- **A tier needs different models per organization** (a customer bringing their own key or model). Then
  the registry becomes tenant-scoped data like agent definitions (ADR-013) rather than code.
- **Provider-level refusal semantics diverge.** `readContent` returns our own union precisely so a
  second provider maps into it; if one cannot, the orchestrator would learn a second failure
  vocabulary, which is the thing to prevent.

## Related

- [ADR-004](ADR-004-model-tiering.md) — the tiers, controls, and lint requirement this implements
- [ADR-002](ADR-002-managed-agents-runtime.md) — the runtime bet; the owner's "keep both" answer
- [ADR-012](ADR-012-agent-runtime-port.md) — the port that keeps a second provider possible
- [ADR-013](ADR-013-agent-definitions-as-per-tenant-data.md) — specs carry `{tier, effort}`, never a model
- [ASSUMPTIONS.md](ASSUMPTIONS.md) — ASSUMPTION-010, resolved here
