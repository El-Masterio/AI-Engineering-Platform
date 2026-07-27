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
| P1 Foundation | 4 | 52 | █░░░░░░░░░ 8% |
| P2 Collaboration | 0 | 15 | ░░░░░░░░░░ 0% |
| P3 Depth | 0 | 15 | ░░░░░░░░░░ 0% |
| P4 Polish | 0 | 12 | ░░░░░░░░░░ 0% |
| P5 Delivery | 0 | 13 | ░░░░░░░░░░ 0% |
| P6 Commercial | 0 | 11 | ░░░░░░░░░░ 0% |
| P7 Enterprise | 0 | 10 | ░░░░░░░░░░ 0% |
| P8 Ecosystem | 0 | 4 | ░░░░░░░░░░ 0% |
| **Total** | **4** | **132** | ░░░░░░░░░░ **3%** |

**Currently in progress:** none. **Next up:** `M009 — AppShell and routing skeleton` (sequence deviation: M007→M008→M009 pulled ahead of M003–M006, owner-approved — see BACKLOG.md).

### Completed

| ID | Title | Completed | Notes |
|---|---|---|---|
| M001 | Initialize monorepo and tooling | 2026-07-27 | 14 workspace projects; 12/12 build; resolved ASSUMPTION-008 (Node 22 → 24 LTS) |
| M002 | Shared config and enforced boundaries | 2026-07-27 | 10 adversarial gates verified rejecting; pre-commit 3992 ms; 3 latent misconfigs caught |
| M007 | Design tokens | 2026-07-27 | 116 tokens; 40/40 WCAG pairs pass; caught 4 real contrast failures in §18's own values |
| M008 | UI primitives | 2026-07-27 | 11 components; 42 tests; 9 axe assertions; Storybook live at :6006 |

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
