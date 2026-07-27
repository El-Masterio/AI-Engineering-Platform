# 3. Problem Statement

## The core problem

**AI can now write most of the code in a software project. It cannot yet be trusted to deliver a
software project.** The gap between those two statements is where every hour of wasted effort
lives, and it is the gap Atelier closes.

## Why the gap exists

Model capability is not the bottleneck. Five structural problems are:

### 1. No plan, so no coherence

Coding agents operate turn-by-turn on whatever is in front of them. There is no artifact that says
"this system has seven components, they depend on each other in this order, and we are on step
three." The result is locally-plausible, globally-incoherent software: three competing HTTP
clients, two auth patterns, a data model that contradicts itself between modules.

Human teams solve this with architecture documents, tickets, and a tech lead. Agent workflows
mostly don't have those, so the incoherence compounds until someone rewrites it.

### 2. Self-review is not review

An agent asked "is this correct?" about its own output is measuring the same distribution that
produced the output. It has systematic blind spots and will confirm them. Real engineering
organizations have independent review for exactly this reason.

Most AI coding workflows have no independent verification step at all. The human becomes the sole
reviewer, which means the human's review capacity becomes the throughput ceiling — and the value
proposition ("save engineering time") inverts.

### 3. Amnesia resets progress every session

A new session does not know that the team already tried and rejected Redis for this queue, that
the `users` table has a soft-delete convention, or that the client insists on European data
residency. So it re-litigates settled decisions, violates conventions, and re-introduces bugs that
were already fixed.

Human teams carry this in institutional memory, ADRs, and code review culture. Stateless agents
carry none of it, which makes month six no faster than month one — the opposite of how a real team
behaves.

### 4. Running untrusted generated code is genuinely dangerous

To be useful, an agent must execute code it just wrote, install dependencies it just chose, and
read repositories that may contain adversarial content. Each of those is an attack surface:

- **Prompt injection via tool output** — a malicious string in an issue, a README, a web page, or a
  dependency's post-install script can redirect an agent that has credentials.
- **Sandbox escape** — code execution on shared infrastructure without hard isolation is a
  multi-tenant breach waiting to happen.
- **Credential exfiltration** — an agent with an API key in its context can be induced to print it.
- **Supply chain** — an agent that runs `npm install` on a package it selected has imported
  arbitrary code execution into your build.

Teams either accept this risk quietly or refuse to adopt agents for anything that touches
production. Neither is a good outcome.

### 5. Cost is unpredictable and invisible until the invoice

Autonomous loops can burn tokens without bound: re-reading the same files, exploring dead ends,
retrying failures, spawning subagents that spawn subagents. Without per-task budgets, model
tiering, and prompt-cache discipline, a single runaway task can cost more than a week of the
engineer it replaced — and nobody notices until billing.

For a vendor, this is worse: inference is COGS, so uncontrolled spend is negative gross margin on
your own product.

## Who feels this, and how it shows up

| Segment | Symptom |
|---|---|
| **Solo developers / freelancers** | Can generate a prototype fast, then stall — no tests, no docs, no structure, and refactoring it costs more than writing it did |
| **Agencies** | Cannot promise a client an AI-assisted delivery because output quality is not repeatable across projects or staff |
| **Startups** | Ship fast, accumulate unreviewed AI-generated code, hit a wall around the third engineer when nobody understands the codebase |
| **Enterprise teams** | Blocked at procurement: no audit trail, no SSO, no data residency answer, no way to prove secrets are safe, no cost governance |
| **Technical leaders generally** | Have no way to answer "was this reviewed, by what, against which standard?" — so they cannot delegate anything that matters |

## What people do today, and why it falls short

| Current approach | Where it breaks |
|---|---|
| IDE copilots (Copilot, Cursor, Windsurf) | Optimize the inner loop. No plan, no independent review, no project memory, no deployment. Excellent tools; different job. |
| Terminal coding agents (Claude Code, Codex CLI, Aider) | Genuinely capable, but single-agent, single-session, local. No org model, no team collaboration, no governance, no cost ledger. |
| Autonomous SWE agents (Devin, Factory, Jules) | Closest competitors. Weaker on the *organizational* layer: explicit milestone planning, org-authored standards, multi-role review gates, and cost transparency. |
| App builders (Lovable, Bolt, v0, Replit Agent) | Superb zero-to-demo. Struggle at maintenance, testing, and non-greenfield work; output often not a codebase a team wants to own. |
| DIY agent frameworks (LangGraph, CrewAI, Agent SDKs) | Maximum flexibility, but the customer must build sandboxing, memory, verification, cost control, and governance themselves — which is the entire hard part. |
| Just hiring engineers | Works. Slow to hire, expensive, and doesn't scale down to "I need one internal tool." |

## The problem restated as a product requirement

Build a system where:

1. Every project has an explicit, dependency-ordered plan the user approved.
2. No work is presented as complete until an **independent** agent reviewed it and tests passed.
3. Project knowledge persists and is consulted across sessions, weeks, and staff changes.
4. Generated code executes in hard isolation, with egress control, and **never** sees a raw secret.
5. Every run has a token budget; every project has a visible cost ledger.
6. Every agent action is recorded in an immutable audit log an enterprise buyer can accept.

Those six lines are the product. Sections 10 and 11 turn them into requirements.

## Related

- [1. Product Vision](01-product-vision.md)
- [5. Competitor Analysis](05-competitor-analysis.md)
- [10. Functional Requirements](../01-requirements/10-functional-requirements.md)
- [17. Security Strategy](../02-architecture/17-security-strategy.md)
- [27. Risk Analysis](../05-delivery/27-risk-analysis.md)
