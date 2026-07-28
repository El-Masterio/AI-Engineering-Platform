# Decision Log

Chronological index of every architectural decision. ADRs are **immutable once accepted** — a changed
decision gets a new ADR that supersedes the old one, and the old one stays.

Format and rules: [§20](../04-engineering/20-documentation-structure.md#architecture-decision-records).

## Index

| ADR | Title | Status | Date | Reversal cost |
|---|---|---|---|---|
| [001](ADR-001-typescript-monorepo.md) | TypeScript monorepo with pnpm + Turborepo | Accepted | 2026-07-27 | High |
| [002](ADR-002-managed-agents-runtime.md) | Claude Managed Agents as the execution plane, behind an `AgentRuntime` port | Accepted | 2026-07-27 | **Medium — mitigated by design** |
| [003](ADR-003-postgres-primary-datastore.md) | PostgreSQL + pgvector as the single primary datastore | Accepted | 2026-07-27 | High |
| [004](ADR-004-model-tiering.md) | Model tiering by task class, resolved at runtime | Accepted | 2026-07-27 | Low |
| [005](ADR-005-skills-as-capability-format.md) | `SKILL.md` as the agent capability-pack format | Accepted | 2026-07-27 | Medium |
| [006](ADR-006-modular-monolith.md) | Modular monolith with enforced boundaries, not microservices | Accepted | 2026-07-27 | Medium |
| [007](ADR-007-verification-gates-structural.md) | Verification gates enforced structurally, not by prompt | Accepted | 2026-07-27 | **Very high — this is the product** |
| [008](ADR-008-design-system-v2.md) | Design System v2.0: warm neutral, light-only, orange-and-blue | Accepted | 2026-07-27 | High — replaces the entire visual identity; supersedes §18 v1.0 and inverts §8's theme scope |
| [009](ADR-009-railway-staging.md) | Railway for staging, GHCR for images, no production yet | Accepted | 2026-07-28 | Medium — the artifact stays portable, so the host is a week to change rather than a rewrite |

## Pending decisions

Recorded so they aren't forgotten, with the trigger that forces the call.

| Decision | Trigger | Phase |
|---|---|---|
| Fastify vs. NestJS — revisit with implementation experience | P1 gate retrospective | 1 |
| Better Auth vs. WorkOS as the primary identity store | Enterprise demand arriving before Phase 7 | 1 or 7 |
| BullMQ vs. Temporal for orchestration | Deployment workflows needing multi-day, multi-approval state | 5 |
| pgvector vs. dedicated vector store | Vector search p95 > 200 ms, or embedding load affecting primary DB latency | 4+ |
| Managed containers vs. Kubernetes | **Settled for staging by [ADR-009](ADR-009-railway-staging.md): Railway.** Still open for production — measured scale or cost crossover | 6 |
| **Model provider — Anthropic vs. OpenRouter + Groq** | **Direction chosen by the owner 2026-07-28: OpenRouter primary, Groq on failover.** The env schema now accepts all three and requires at least one in production. The ADR is still owed — see the note below, because this is not a swap of one API key for another. | Before M024 |
| Multi-provider model support | Provider risk materializing, or a competitor model clearly winning a task class | — |
| Canary deployments | Traffic sufficient for a statistically meaningful signal | 6 |

## Decisions deliberately deferred

### Note — what a provider change actually costs

The owner has said they would rather use a provider with a free quota. Recording the shape of that
decision now, while it is cheap, so the later conversation starts from facts:

- **ADR-002 (Managed Agents) does not survive it.** The sandboxed per-session container, the
  credential vault with egress-time secret substitution, versioned memory stores and cron
  deployments are Anthropic-platform features, not model features. ADR-002 calls itself the
  highest-leverage and highest-risk decision in the project and budgets M127 as its exit ramp.
  Changing provider means taking that ramp and building that infrastructure — §17 Control 3's
  "no secret ever reaches the agent" is solved *by construction* today and would become ours to
  solve.
- **ADR-004 (model tiering) is re-costed, not discarded.** The four tiers are a shape; the model
  IDs and prices behind them would all change.
- **What it does not cost:** M005's schema. `ANTHROPIC_API_KEY` is one line in
  `packages/config/src/env.ts` and one in `.env.example`, both covered by the completeness test.
  Nothing else in the codebase reads it yet.

A middle path worth weighing when we do decide: keep Anthropic for the reasoning tier where the
platform features earn their cost, and route the utility tier (classification, summarisation,
extraction) to a cheap or free provider behind the existing `AgentRuntime` port. That is what the
port was for.

**Status 2026-07-28.** The owner has chosen OpenRouter as primary with Groq as failover.
`OPENROUTER_API_KEY` and `GROQ_API_KEY` are in the env schema; production requires at least one
provider key rather than a named one, so the schema does not pre-empt the ADR. Nothing calls a model
yet, so no other code changes. The ADR falls due when `packages/agent-runtime` gets its first real
adapter (M024 onward) — that is the point at which ADR-002 either holds or is replaced, and it
cannot be answered by a config file.

Not pending — actively chosen *not* to decide yet, because deciding early would cost optionality
without buying anything.

| Deferred | Why | Revisit |
|---|---|---|
| Vertical product packaging (fintech, healthcare) | Needs customer evidence about which vertical | Phase 8+ |
| Fine-tuned or custom models | Frontier capability is improving faster than we could fine-tune | — |
| Pricing exact figures | §7's numbers are modeled; M050 measures reality | P1 gate |
| Autonomy level thresholds | Need real trust-metric distributions, not guesses | P2+ |

## Superseded decisions

| Superseded | By | What changed |
|---|---|---|
| §18 v1.0 visual language (dark-first, near-black `#0d1116`, deep-teal accent, 13px dense scale) | [ADR-008](ADR-008-design-system-v2.md) | Owner directive replaced the visual identity wholesale with a warm-neutral, light-only, orange-and-blue system. The *token architecture* from v1.0 was not superseded — it is what made the replacement a one-file change. |
| §8 "dark mode only in MVP" | [ADR-008](ADR-008-design-system-v2.md) | Inverted: light only in MVP, dark deferred to M083. |

## Related

- [ASSUMPTIONS.md](ASSUMPTIONS.md) — every assumption made without owner input
- [ADR-TEMPLATE.md](ADR-TEMPLATE.md)
- [§20 Documentation Structure](../04-engineering/20-documentation-structure.md)
