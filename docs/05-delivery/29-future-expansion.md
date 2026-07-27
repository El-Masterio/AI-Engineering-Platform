# 29. Future Expansion Strategy

Beyond the nine phases. This document exists to make sure today's architecture doesn't foreclose
tomorrow's options — and to name the expansions we've *rejected*, so they aren't rediscovered as
obvious later.

## Expansion axes

```
                        DEPTH
              (more autonomous, more capable)
                          ▲
                          │
     Autonomy ladder ─────┼───── Self-improvement
                          │
  ◀───────────────────────┼───────────────────────▶
  BREADTH                 │                 PLATFORM
  (more languages,        │        (others build on us)
   stacks, project types) │
                          │
                          ▼
                      DISTRIBUTION
              (more segments, more geographies)
```

We can only push hard on one axis at a time. The ordering below is deliberate.

---

## Axis 1 — Depth (the primary axis)

### Earned autonomy

The ladder from §9. What matters architecturally is that **autonomy is a per-organization, measured,
revocable property** — not a global setting.

| Requirement | Why it's decided now |
|---|---|
| Autonomy level stored per organization, not globally | Retrofitting per-tenant policy is painful |
| Policy engine consults autonomy level on every gate decision | One place, already built in Phase 1 |
| Trust metrics computed per organization | Requires the cost ledger and audit log we already have |
| **Automatic revocation on metric regression** | An autonomy grant that can only go up is a liability |

The last point is the non-obvious one: a platform that earns autonomy must also be able to lose it,
automatically, without a human noticing first.

### Self-improvement

The platform learning from its own failures. The mechanism already exists — capability packs are
versioned documents — so this becomes:

1. Agent fails a task in a characteristic way.
2. Failure pattern is detected across runs (not from a single instance).
3. A proposed capability-pack amendment is generated.
4. **A human reviews and accepts it.** Never auto-applied.
5. The eval suite verifies the change actually helps before it ships.

**Guardrail:** self-modification without human review and eval verification is how an agent system
drifts into incoherence. Steps 4 and 5 are not optional, at any autonomy level. The `self-healing`
and `create-skill` packs in `skills/` are the seed of this workflow.

### Longer horizons

From milestones (hours) to epics (days) to projects (weeks) running autonomously with
exception-only escalation. Requires: reliable compaction, memory that stays coherent over hundreds of
runs, and cost forecasting accurate enough to approve a week of work up front.

---

## Axis 2 — Breadth

| Expansion | Requires | Difficulty |
|---|---|---|
| More languages (Go, Rust, Java, C#, PHP, Ruby) | Capability packs + eval corpus per language. **The 13-language `code-review-standards` pack already covers much of the review side.** | Low–medium |
| More frameworks (Django, Rails, Spring, .NET) | Framework-specific packs; project templates | Medium |
| Mobile (React Native, Swift, Kotlin) | Build toolchains in the sandbox; device simulators | High |
| Data / ML projects | Different verification model — notebooks and pipelines aren't unit-testable the same way | High |
| Embedded / systems | Cross-compilation, hardware simulation | Very high — probably never |
| Legacy modernization | Very large repo comprehension; incremental strangler planning | High, **and commercially attractive** |

**Cheapest expansion, highest leverage:** more languages. It is mostly capability-pack authoring plus
eval corpus, and the architecture already supports it without change.

**Most commercially interesting:** legacy modernization. It is where memory and planning matter most,
where budgets are largest, and where a stateless competitor is least able to compete. It is also the
hardest technically.

---

## Axis 3 — Platform

### The marketplace flywheel

```
More customers → more capability packs authored → better output
     ▲                                                  │
     └──────────── stronger product ◀───────────────────┘
```

Requires from Phase 8: a stable capability-pack contract, versioning and compatibility guarantees,
security scanning of third-party packs, revenue sharing, and quality signals (ratings, usage).

**The security question is the hard one.** A third-party pack is untrusted content that influences
agent behavior. Controls: mandatory scanning, a capability ceiling (a pack can never grant a tool the
agent's allowlist lacks), sandboxed evaluation before listing, and publisher verification. The
`skill-security-audit` pack is the seed of the scanner.

### Integration surface

MCP is the natural mechanism for customers to connect their own tools (Jira, Linear, Sentry, internal
APIs) to agents. Architecturally this is additive — tools are already an allowlist concept, so a
customer-connected tool is a new allowlist entry, not a new subsystem.

### Vertical products

Same engine, opinionated packs and templates per domain: fintech (compliance-heavy), healthcare (HIPAA),
e-commerce, internal tools. Higher price, narrower market, faster time-to-value. A packaging exercise
rather than an engineering one — which is exactly why it's attractive.

---

## Axis 4 — Distribution

| Expansion | Notes |
|---|---|
| Geographic (EU, then APAC) | Requires Phase 7 residency work. EU first — the compliance work is already required |
| Self-hosted / air-gapped | M127's self-hosted adapter is the foundation. Highest-value for regulated buyers, highest support cost |
| Reseller / white-label for agencies | Agencies sell Atelier-powered delivery to *their* clients. Natural given the beachhead |
| Education | Free tier plus curriculum. The visible plans and ADRs are genuinely good teaching material |
| Cloud marketplaces (AWS/Azure/GCP) | Procurement shortcut for enterprise. Low engineering cost, real revenue unlock |

---

## Architectural decisions made now to keep options open

This is the operative part of this document. Each row is a decision already taken in the blueprint
*because* of a future expansion, and the reason is recorded so nobody "simplifies" it away.

| Decision | Expansion it enables | Cost of not doing it now |
|---|---|---|
| Agents are data, not code | New roles, custom agents, marketplace | Every new role is a code change |
| Capability packs are versioned documents | Org standards, marketplace, self-improvement, new languages | Expertise trapped in prompts |
| `AgentRuntime` port | Self-hosted, air-gapped, provider migration | Vendor lock with no exit |
| Model tier abstraction | Multi-provider, model migration | Model IDs scattered through the codebase |
| `organization_id` + RLS from M001 | Everything multi-tenant | An unrecoverable rewrite |
| Audit log from M001 | Enterprise, compliance, autonomy trust metrics | Cannot reconstruct history retroactively |
| Cost ledger from M001 | Billing, forecasting, autonomy gating, margin management | No basis for any pricing decision |
| Autonomy level as per-org policy data | The autonomy ladder | Global flag; no per-customer trust |
| Design tokens as CSS variables | Light mode, white-label theming | A re-skin instead of a config change |
| Versioned REST API | Public API, SDK, integrations | Breaking changes with no migration path |
| Memory as a versioned, redactable store | GDPR erasure, cross-project learning, audit | Erasure requests become an engineering project |
| Tools as an allowlist concept | MCP integrations, custom tools | Every integration is a security review from scratch |

## Explicitly rejected expansions

Recorded so they don't return as fresh ideas:

| Rejected | Why |
|---|---|
| Building our own foundation models | Capital-intensive, not our competence, and the tide rises without us |
| Becoming a general-purpose agent platform | Loses the opinionated organizational design that *is* the product |
| Consumer / no-code market | Our output is a repository; that only has value to someone who can read one |
| Full-service software agency | Different business, different margins, doesn't scale |
| IDE plugin as a primary surface | Different job; incumbents own the inner loop |
| Multi-cloud | Solves a problem we don't have; every abstraction becomes lowest-common-denominator |
| Real-time collaborative editing | The agents do the editing; humans review |
| Blockchain / crypto anything | No problem here that it solves |

## Sequencing principle

**Depth before breadth before platform before distribution.**

A deep, narrow product that works is a business. A broad, shallow product that mostly works is a
demo. Widening the supported surface before the core loop is reliable multiplies the ways it can fail
and makes quality regressions impossible to attribute.

The only exception: **adding languages is cheap enough to do opportunistically** during any phase,
because it is capability-pack authoring plus evals rather than architectural change.

## Related

- [1. Product Vision](../00-foundation/01-product-vision.md)
- [9. Feature Roadmap](../00-foundation/09-feature-roadmap.md)
- [13. AI Agent Architecture](../02-architecture/13-agent-architecture.md)
- [30. Master Development Plan](30-master-development-plan.md)
