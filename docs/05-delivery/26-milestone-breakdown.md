# 26. Milestone Breakdown

This document defines the **milestone system** — conventions, complexity model, and live status.
The 132 milestone definitions themselves live in [BACKLOG.md](../backlog/BACKLOG.md) so there is one
place to edit them.

## Milestone anatomy

Every milestone carries exactly these fields (per the governing specification):

| Field | Rule |
|---|---|
| **ID** | `M001`–`M132`. Permanent. Never renumbered, never reused. A cancelled milestone stays as `Cancelled`. |
| **Title** | Imperative, ≤ 60 chars |
| **Objective** | One or two sentences: what capability exists after this that didn't before |
| **Dependencies** | Explicit milestone IDs. `—` means none |
| **Complexity** | XS / S / M / L / XL (below) |
| **Deliverables** | Concrete artifacts — files, endpoints, docs, tests |
| **Acceptance criteria** | Binary, verifiable statements. If it can't be checked, it isn't a criterion |
| **Order** | Suggested implementation position |

## Complexity model

Deliberately **not** time estimates. Complexity is about risk and uncertainty; velocity varies with
who and what.

| Size | Meaning | Rough effort | Files touched |
|---|---|---|---|
| **XS** | Configuration or a single well-understood change | < 0.5 day | 1–3 |
| **S** | One clear unit of work, no unknowns | 0.5–1 day | 3–8 |
| **M** | Multiple components; some design judgment | 2–4 days | 8–20 |
| **L** | Cross-cutting; real design decisions; likely an ADR | 1–2 weeks | 20–50 |
| **XL** | **Too big. Must be split before work starts.** | — | — |

**No XL milestone is ever implemented.** If a milestone is sized XL, splitting it is the first task.
An XL in the backlog is a planning defect, not a large piece of work.

## Milestone types

| Type | Marker | Notes |
|---|---|---|
| **Foundation** | 🏗 | Infrastructure others depend on. Cannot be deferred or worked around |
| **Feature** | ✨ | User-visible capability |
| **Agent** | 🤖 | New or changed agent role / capability pack |
| **Security** | 🔒 | Security control. **Never deferred for schedule** |
| **Quality** | ✅ | Testing, observability, performance |
| **Debt** | ♻️ | Deliberate remediation of recorded debt |
| **Docs** | 📄 | Documentation-only |

## Status vocabulary

`Blocked` · `Ready` · `In Progress` · `In Review` · `Verified` · `Done` · `Cancelled` · `Superseded`

**`Done` requires the full Definition of Done from §22.** A milestone whose tests fail is `Blocked`,
never `Done` — reporting otherwise is the failure mode the whole product exists to prevent, so we
don't do it to ourselves.

## Phase summary

| Phase | Range | Count | XS | S | M | L |
|---|---|---:|---:|---:|---:|---:|
| P1 Foundation & core loop | M001–M052 | 52 | 6 | 19 | 21 | 6 |
| P2 Collaboration & control | M053–M067 | 15 | 1 | 7 | 6 | 1 |
| P3 Engineering depth | M068–M082 | 15 | 0 | 5 | 8 | 2 |
| P4 Polish & breadth | M083–M094 | 12 | 2 | 5 | 4 | 1 |
| P5 Delivery & operations | M095–M107 | 13 | 0 | 3 | 7 | 3 |
| P6 Commercial | M108–M118 | 11 | 1 | 4 | 5 | 1 |
| P7 Enterprise readiness | M119–M128 | 10 | 0 | 3 | 5 | 2 |
| P8 Ecosystem & platform | M129–M132 | 4 | 0 | 0 | 2 | 2 |
| **Total** | | **132** | **10** | **46** | **58** | **18** |

## The 18 L-complexity milestones

These carry the program's risk. Each requires an ADR and a design review before implementation
starts, and each is a candidate for splitting if the design review reveals more than expected.

| ID | Title | Phase | Why it's L |
|---|---|---|---|
| M023 | AgentRuntime port + fake adapter | 1 | Defines the abstraction the whole product depends on |
| M026 | Managed runtime adapter + sandbox provisioning | 1 | External integration; the ADR-002 bet lives or dies here |
| M037 | Director planning agent | 1 | Prompt engineering, output contracts, plan quality |
| M040 | Task graph dispatch + orchestrator state machines | 1 | Concurrency, dependencies, resumability |
| M043 | Independent review gate | 1 | The product's core claim, structurally enforced |
| M050 | Cost ledger + budget enforcement | 1 | Money; correctness is non-negotiable |
| M060 | RBAC + multi-user organizations | 2 | Touches every endpoint and every query |
| M070 | Organization capability packs | 3 | The platform thesis; untrusted content handling |
| M075 | Knowledge base + retrieval | 3 | Embeddings, chunking, citation correctness |
| M079 | Security Engineer agent + conditional gate | 3 | Security-critical; blocks milestones |
| M088 | Existing-repository import & analysis | 4 | Large codebases, unknown shapes |
| M096 | Deployment subsystem | 5 | Irreversible actions; the riskiest capability |
| M100 | IaC generation with plan-review gate | 5 | Agents writing infrastructure |
| M104 | Monitoring, SLOs, burn-rate alerting | 5 | Operational correctness |
| M110 | Billing, subscriptions, credit metering | 6 | Money, tax, invoicing |
| M121 | SSO + SCIM | 7 | Enterprise identity |
| M125 | Data residency (EU/US regions) | 7 | Multi-region data plane |
| M127 | Self-hosted execution adapter | 7 | **Proves the ADR-002 exit ramp is real** |

M127 deserves note: it is scheduled not only because enterprise customers need it, but because it is
the only way to *verify* that the `AgentRuntime` abstraction actually holds. An untested exit ramp
isn't one.

## Progress tracker

Updated in the same commit as each milestone's work.

| Phase | Done | Total | Progress |
|---|---:|---:|---|
| P0 Blueprint | 1 | 1 | ██████████ 100% |
| P1 Foundation | 11 | 52 | ██░░░░░░░░ 21% |
| P2 Collaboration | 0 | 15 | ░░░░░░░░░░ 0% |
| P3 Depth | 0 | 15 | ░░░░░░░░░░ 0% |
| P4 Polish | 0 | 12 | ░░░░░░░░░░ 0% |
| P5 Delivery | 0 | 13 | ░░░░░░░░░░ 0% |
| P6 Commercial | 0 | 11 | ░░░░░░░░░░ 0% |
| P7 Enterprise | 0 | 10 | ░░░░░░░░░░ 0% |
| P8 Ecosystem | 0 | 4 | ░░░░░░░░░░ 0% |
| **Total** | **11** | **132** | █░░░░░░░░░ **8%** |

**Currently in progress:** none. **Next up:** `M025 — Capability pack loader and scanner`. **Last completed:** `M024 — Agent specification schema`, agents as versioned per-tenant data (ADR-013). CI stage 3 (integration) went live with M004. (Sequence deviation: M007→M008→M009 were pulled ahead of M003–M006, owner-approved — see BACKLOG.md.)

### Completed

| ID | Title | Completed | Notes |
|---|---|---|---|
| M001 | Initialize monorepo and tooling | 2026-07-27 | 14 workspace projects; 12/12 build; resolved ASSUMPTION-008 (Node 22 → 24 LTS) |
| M002 | Shared config and enforced boundaries | 2026-07-27 | 10 adversarial gates verified rejecting; pre-commit 3992 ms; 3 latent misconfigs caught |
| M007 | Design tokens | 2026-07-27 | 116 tokens; 40/40 WCAG pairs pass; caught 4 real contrast failures in §18's own values |
| M008 | UI primitives | 2026-07-27 | 11 components; 42 tests; 9 axe assertions; Storybook live at :6006 |
| M009 | AppShell and routing | 2026-07-27 | Next.js app live at :3000; LCP 32 ms; caught a dark-first spec violation |
| M003 | CI pipeline | 2026-07-28 | 3 parallel jobs, 11 gates; cached re-run 27 s vs 3 min budget; found Storybook unstyled since M008 |
| M004 | Postgres, Drizzle, RLS | 2026-07-28 | 22 integration tests on real PG17; FORCE RLS verified; found domain purity blind to `node:` imports |
| M005 | Configuration validation | 2026-07-28 | Refuses to boot on bad config (exit 78), verified with real processes; secrets never echoed |
| M006 | Observability skeleton | 2026-07-28 | Trace across HTTP→service→DB; 8 secret classes redacted; found OTel auto-instrumentation silently traced nothing |
| M010 | Local development environment | 2026-07-28 | Clean clone to running app in 3 commands (~27 s); the clone found 4 bugs a working tree hid |
| M013 | Domain: organizations and users | 2026-07-28 | 94 tests, zero external imports, 90% floor; last-owner invariant enforced set-wide |
| M012 | Developer guide | 2026-07-28 | Verified by following it on a clean clone, not by reading it |
| M011 | Deploy pipeline to staging | 2026-07-29 | Live on Railway via GHCR; found `ARG GIT_SHA` undeclared, which made the smoke test's revision check inert |
| M014 | Authentication | 2026-07-29 | Better Auth on a dedicated `atelier_auth` role (ADR-010); Argon2id; email behind an `EmailPort` (ADR-011) |
| M015 | Organization and membership management | 2026-07-29 | Invitations, role changes, last-owner protection at the API boundary |
| M016 | API conventions and error envelope | 2026-07-29 | Three Fastify error paths unified; found `@fastify/swagger` producing a valid EMPTY document |
| M017 | Policy engine | 2026-07-29 | Corrected two of my own modelling errors: gated actions ungranted by every role, and scopes conflated with actions |
| M018 | Immutable audit log | 2026-07-29 | Partitioned; append-only proven by trying to UPDATE and DELETE as the owner; partition creation needed SECURITY DEFINER |
| M019 | API keys | 2026-07-29 | SHA-256 (not Argon2 — opposite choice for the opposite reason); shown once |
| M020 | Rate limiting | 2026-07-29 | Sliding window as an atomic Redis **Lua script**; a pipeline is not atomic |
| M021 | Cross-tenant test suite (generated) | 2026-07-29 | Cases generated from `pg_class`; every exemption carries a written reason. M024 found it was silently skipping INSERT coverage for new tables |
| M022 | Auth and organization UI | 2026-07-29 | 16 tests; axe caught `aria-selected` on a `button`, which my comment had confidently defended |
| M023 | AgentRuntime port and fake adapter | 2026-07-30 | Purity tested, not asserted; suite proven by three broken adapters. Shipped a tier vocabulary that contradicted ADR-004 — caught in M024 |
| M024 | Agent specification schema | 2026-07-30 | Six roles as YAML, loaded by listing a directory; immutability enforced by trigger, proven by raw UPDATE/DELETE as the owner |

## Milestone hygiene rules

1. **No work without a milestone.** Including bug fixes — a fix gets a `fix/` milestone entry.
2. **Dependencies are verified before starting**, not assumed. `CLAUDE.md` step 3.
3. **Splitting is always allowed.** Insert `M042a`, `M042b`; never renumber the rest.
4. **Discovered work becomes a new milestone**, not silent scope creep on the current one.
5. **A milestone that grows past its complexity estimate** is stopped, split, and re-estimated.
6. **Security milestones are never deferred for schedule.** If the schedule is at risk, feature
   milestones move.
7. **Every milestone updates this document's tracker** in its own commit.

## Related

- [BACKLOG.md](../backlog/BACKLOG.md) — the full 132 definitions
- [25. Initial Project Roadmap](25-roadmap.md)
- [30. Master Development Plan](30-master-development-plan.md)
- [CLAUDE.md](../../CLAUDE.md) — the per-milestone workflow
