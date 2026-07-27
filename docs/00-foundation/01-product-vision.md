# 1. Product Vision

## The vision

**Software teams should be able to hire capability, not headcount.**

Atelier is a platform where you describe a software goal and an organized team of AI agents
delivers it — with the artifacts a real engineering organization produces: an architecture
document, a milestone plan, reviewed code, passing tests, written documentation, a deployment,
and production monitoring.

The experience we are building is *hiring an elite engineering company*, not *using an AI
chatbot*. The difference is not model quality. It is **organization**: a Director that plans,
specialists that execute within their remit, reviewers that gate, memory that persists across
weeks, and a paper trail you can audit.

## What "good" looks like in five years

A technical founder opens Atelier on Monday, writes three paragraphs describing an inventory
system for a client, and approves an architecture. On Friday there is a deployed application, a
test suite, an ADR trail explaining every significant decision, a cost report, and an on-call
runbook. Two months later they ask for a change; the platform still remembers why the schema
looks the way it does, and the change lands without regressing anything.

## Vision pillars

**1. It behaves like an organization, not a tool.**
Roles are real and bounded. A Backend Engineer agent cannot deploy to production. A Code Reviewer
never approves its own work. The Director owns the plan and is accountable for it. This is not
theatre — the tool allowlists, sandbox permissions, and approval gates enforce it.

**2. Verification is the product.**
Anyone can generate code. The scarce thing is *trustworthy* code. Every unit of work passes
through a review agent and a test gate before it is presented as done. The platform's central
claim is not "the AI wrote this" but "the AI wrote this, and here is the evidence it works."

**3. Memory compounds.**
A project's architecture decisions, naming conventions, past failures, and rejected approaches
persist and are consulted. Month six should be *faster* than month one because the platform knows
the codebase. This is the moat: a stateless competitor restarts every session.

**4. The human stays in command, cheaply.**
Autonomy is dialed, not binary. Human gates sit at the decisions that matter — architecture
approval, production deploys, spend thresholds, destructive migrations — and nowhere else. The
default posture is "the agents proceed; you are told what happened," not "approve 400 diffs."

**5. Cost is a first-class, visible dimension.**
Token spend is the cost of goods sold. Every run carries a budget, every project carries a ledger,
and the user sees what a milestone cost before they approve the next one. A platform that
surprises people with a bill does not get to be enterprise software.

**6. Capabilities are extensible by users, not just by us.**
An agent's expertise is a versioned document, not hardcoded prose. Organizations encode their own
standards — "our API conventions," "our security checklist," "how we do migrations" — and every
agent in the org inherits them. This is the path from product to platform.

## What Atelier is deliberately not

- **Not an IDE copilot.** We are not competing for the inner loop keystroke-by-keystroke. We own
  the outer loop: goal → plan → delivered increment.
- **Not a no-code builder.** The output is a real repository with real code the customer owns and
  can walk away with. No proprietary runtime lock-in.
- **Not an agent framework.** Developers who want to compose their own agents have libraries for
  that. We sell the finished organization, opinions included.
- **Not a model provider.** We are an application layer. Model capability is a rising tide we ride,
  not a thing we manufacture.

## The strategic bet

Frontier model capability is improving faster than the surrounding scaffolding — sandboxing,
memory, verification, cost control, permissioning, auditability. The durable value is in that
scaffolding and in the organizational design layered on top of it. As models get better, a
platform with good scaffolding gets dramatically better; a thin wrapper gets commoditized.

We therefore invest in **verification, memory, and governance** as the core product, and treat raw
generation as a dependency we consume.

## How we will know the vision is working

| Signal | Why it matters |
|---|---|
| Milestone acceptance rate without human rework | Measures whether "trustworthy" is real |
| Ratio of month-6 to month-1 throughput on the same project | Measures whether memory compounds |
| Human approval events per delivered milestone | Measures whether autonomy is real, not performed |
| Gross margin per project | Measures whether the unit economics survive contact with reality |
| Share of runs using org-authored capability packs | Measures whether the platform thesis holds |

## Related

- [2. Mission Statement](02-mission.md)
- [3. Problem Statement](03-problem-statement.md)
- [13. AI Agent Architecture](../02-architecture/13-agent-architecture.md)
- [29. Future Expansion Strategy](../05-delivery/29-future-expansion.md)
