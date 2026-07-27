# 2. Mission Statement

## Mission

**To give every software team the leverage of a senior engineering organization — planned,
reviewed, tested, documented, and accountable — available on demand.**

## Expanded

We build the coordination, verification, and memory layer that turns raw model capability into
delivered software. We are responsible for the parts that make engineering output *trustworthy*:
that a plan exists, that work was reviewed by something other than its author, that tests ran and
passed, that decisions were written down, that secrets never leaked, and that the cost was visible
before it was incurred.

## Operating principles

**Verification over generation.** When forced to choose between producing more output and proving
the output is correct, we choose proof. A platform that produces twice as much unreviewed code is
worth less than one that produces half as much trusted code.

**Boundaries over capability.** Every agent gets the narrowest tool set and the smallest
permission scope that lets it do its job. We treat an over-privileged agent as a defect, not a
feature.

**Show the work.** Plans, diffs, test output, decisions, and costs are visible artifacts, not
hidden internal state. If the user cannot audit it, we have not shipped it.

**Durable over clever.** We choose boring, well-understood technology for the parts that must not
break, and reserve novelty for the parts that are genuinely new. The agent layer is novel enough.

**Own the exit.** Customers get a real repository they can clone and run without us. Lock-in
through switching cost is a business model we decline; we intend to be worth renewing.

**Cost is a design constraint, not an afterthought.** LLM inference is our COGS. Model tiering,
prompt caching, budget ceilings, and context discipline are architecture, not optimization.

## What we are accountable for

| We are accountable for | We are not accountable for |
|---|---|
| The plan being coherent and dependency-ordered | The customer's business strategy |
| Work being reviewed by an independent agent | Guaranteeing zero defects |
| Tests existing, running, and their results being reported honestly | The customer's pre-existing untested legacy code |
| Secrets never entering an agent's context or sandbox | The customer's own credential hygiene outside Atelier |
| Cost being visible and bounded before it is spent | Model provider pricing changes |
| Decisions being recorded and retrievable | Decisions the customer overrides against advice |
| The customer being able to leave with their code | The customer's choice of hosting after they leave |

## The one-sentence test

If a prospective customer asks *"why not just use a coding agent directly?"*, the answer must be
a single sentence:

> **Because a coding agent gives you output; Atelier gives you an organization — a plan, a
> reviewer, a test gate, a memory, an audit trail, and a budget.**

If that sentence ever stops being true, the mission has drifted.

## Related

- [1. Product Vision](01-product-vision.md)
- [3. Problem Statement](03-problem-statement.md)
- [17. Security Strategy](../02-architecture/17-security-strategy.md)
