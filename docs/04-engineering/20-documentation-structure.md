# 20. Documentation Structure

## Principle

**Documentation precedes implementation.** This is the governing rule from
[CLAUDE.md](../../CLAUDE.md), and this section defines the artifacts it produces and who maintains
them.

A second principle follows from the first: **documentation lives in the repository, versioned with
the code it describes.** A wiki drifts. A doc in the same commit as the change it describes does not.

## The documentation set

```
docs/
├── README.md                     index + reading order
├── CHANGELOG.md                  what shipped, per milestone
│
├── 00-foundation/                product: vision → roadmap        (§1–9)
├── 01-requirements/              FRs + NFRs                       (§10–11)
├── 02-architecture/              system, agents, stack, db, api, security  (§12–17)
├── 03-design/                    design system                    (§18)
├── 04-engineering/               structure, standards, testing, CI/CD      (§19–24)
├── 05-delivery/                  roadmap, milestones, risk, debt, expansion, plan  (§25–30)
│
├── backlog/
│   └── BACKLOG.md                the 132 milestones
│
├── decisions/
│   ├── DECISION-LOG.md           chronological index
│   ├── ASSUMPTIONS.md            every assumption + its status
│   ├── ADR-TEMPLATE.md
│   └── ADR-NNN-<slug>.md
│
├── guides/                       created from Phase 1
│   ├── developer-guide.md        local setup → first PR
│   ├── operations-guide.md       deploy, monitor, incident response
│   ├── runbooks/                 one per alert — mandatory
│   └── user-guide.md             end-user documentation
│
└── api/
    └── openapi.json              GENERATED — never hand-edited
```

## Document categories and their rules

| Category | Changes when | Owner | Review |
|---|---|---|---|
| **Foundation** (§1–9) | Strategy shifts | Product | Owner approval |
| **Requirements** (§10–11) | New feature enters a phase | Product + Architect | Owner approval for P0 changes |
| **Architecture** (§12–17) | An ADR changes it | Architect | ADR required |
| **Design system** (§18) | New component or token | UX/UI | ADR required for tokens |
| **Engineering standards** (§19–24) | Practice changes | Whole team | Consensus |
| **Delivery** (§25–30) | Every milestone | Director | Updated in the milestone's commit |
| **ADRs** | Never — they are immutable | Author | Superseded, never edited |
| **Guides & runbooks** | With the code they describe | Implementer | Same PR as the change |
| **CHANGELOG** | Every milestone | Implementer | Same PR |
| **Generated API docs** | Automatically | CI | N/A |

## Architecture Decision Records

ADRs are the mechanism that makes "never contradict a prior decision without documenting why"
operational.

**One file, immutable once accepted.** A decision that changes gets a *new* ADR that supersedes the
old one; the old one stays, marked superseded. The history of what we believed and when is as
valuable as the current state.

```markdown
# ADR-NNN — <Title>

**Status:** Proposed | Accepted | Superseded by ADR-MMM | Deprecated
**Date:** YYYY-MM-DD
**Deciders:** <who>
**Supersedes:** ADR-XXX (if any)

## Context
The forces at play. What problem, what constraints, what we knew at the time.

## Options considered
For each: advantages, disadvantages, scalability, community, maintenance,
licensing, cost, future-proofing. (Per the governing specification.)

## Decision
What we chose, stated plainly.

## Consequences
### Positive
### Negative
### Neutral

## Reversal cost
How hard is this to undo, and what is the exit ramp?

## Revisit triggers
The specific, observable conditions under which we reopen this.
```

**"Reversal cost" and "Revisit triggers" are non-standard additions and they are deliberate.** An
ADR without an exit ramp is a one-way door someone walked through without noticing. ADR-002 (the
runtime dependency) is the clearest example of why this section matters.

### When an ADR is required

- Adding, removing, or replacing a technology
- Changing a module boundary or the layering rules
- Changing the data model non-additively
- Changing the security boundary or a permission model
- Adding a design token
- Changing the agent specification schema
- Anything that contradicts an existing ADR

### When one is not required

Library version bumps, adding a component from existing tokens, adding a feature within existing
architecture, refactors that preserve behavior and boundaries.

## Assumptions register

Every `ASSUMPTION-nnn` marked in the blueprint is tracked in
[`decisions/ASSUMPTIONS.md`](../decisions/ASSUMPTIONS.md) with: what was assumed, why, its impact if
wrong, and how it gets validated.

This exists because a blueprint written without owner input necessarily contains guesses, and an
unrecorded guess becomes an unexamined fact. Each assumption has an owner and a resolution path.

## Runbooks

**Every alert has a runbook. An alert without one is a defect** (NFR-OBS-7).

```markdown
# Runbook: <Alert name>
## What fired, and what it means
## User impact
## Diagnosis — the actual commands to run
## Remediation — steps, with the rollback
## Escalation — who, and when
## Related alerts / known false positives
```

## Documentation quality bar

| Rule | Why |
|---|---|
| Every document opens with what it is for | The reader should know in one sentence whether to keep reading |
| Every document ends with related links | Documentation is a graph; orphans rot |
| Diagrams as text (Mermaid or ASCII) | Diffable, reviewable, never a stale binary |
| Code examples must be real and runnable | A wrong example is worse than none |
| No aspirational documentation | Document what is, not what we hope. Future work goes in the roadmap |
| Uncertainty is stated, not hidden | "Confidence: medium" is more useful than false authority |
| Assumptions are marked inline | `ASSUMPTION-nnn` |
| Prose over bullet fragments for reasoning | Bullets hide the argument; a reader needs the *why* |

## Drift prevention

| Mechanism | Coverage |
|---|---|
| API docs generated from route schemas | Cannot drift from code |
| Docs updated in the same PR as the change | Reviewer rejects if missing |
| Broken internal links fail CI | Structural integrity |
| `CHANGELOG` entry required per milestone | Enforced in the milestone checklist |
| Quarterly documentation review | Catches semantic staleness that automation cannot |
| Architecture drift detection (Phase 4) | Compares the documented component graph to the real import graph |

The last row is the interesting one: eventually the platform should audit its own documentation
against its own code. That is the same capability we sell to customers, applied to ourselves.

## Related

- [CLAUDE.md](../../CLAUDE.md)
- [22. Development Standards](22-development-standards.md)
- [decisions/DECISION-LOG.md](../decisions/DECISION-LOG.md)
