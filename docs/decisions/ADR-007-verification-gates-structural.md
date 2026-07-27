# ADR-007 — Verification gates enforced structurally, not by prompt

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Lead Architect (blueprint phase)

> This ADR documents the decision that *is* the product. If it is ever relaxed, Atelier no longer has a
> reason to exist.

## Context

The product's central claim is not "AI writes your code" — anyone can offer that. It is **"AI writes
your code, and here is the evidence it works."** That claim rests entirely on verification being real.

Three facts make this hard:

1. **Self-review does not work.** An agent asked to check its own output is sampling the same
   distribution that produced it. It has systematic blind spots and will confirm them. This is not a
   prompt-quality problem; it is structural.
2. **Prompts are not guarantees.** An instruction like "do not approve your own work" can be
   subverted by prompt injection, drowned out by a long context, or simply not followed. A control that
   depends on model cooperation is not a control.
3. **Reporting incentives are misaligned.** A model asked "did it work?" after a long, expensive task
   has every contextual pressure toward "yes."

Meanwhile, the commercial pressure to relax verification is constant: gates cost tokens, add latency,
and sometimes block a milestone the customer wants shipped.

## Options considered

### Option A — Prompt-based verification

Instruct the agent to review its work and report honestly.

| | |
|---|---|
| **Advantages** | Zero infrastructure. Cheapest. Fastest. |
| **Disadvantages** | Provides no guarantee whatsoever. Fails to self-review meaningfully; fails under injection; fails under reporting pressure. Cannot be audited — there is no artifact proving review occurred. **Makes the product's core claim false.** |

### Option B — Same agent, separate review turn

Ask the implementer to review in a fresh turn within the same session.

| | |
|---|---|
| **Advantages** | Cheap; some separation. |
| **Disadvantages** | Same model, same context, same blind spots. The authorship context is right there in the conversation, so the review is anchored to it. Marginal improvement over Option A. |

### Option C — Separate agent instance, orchestrator-enforced, with database backstop

| | |
|---|---|
| **Advantages** | Different session, no authorship context, read-only tool allowlist. Self-review is *impossible* rather than discouraged. Produces an auditable artifact. Machine-verified test results rather than self-reported ones. Measurable via seeded-defect evals. |
| **Disadvantages** | More expensive (an extra reasoning-tier run per milestone). Adds latency. More orchestration complexity. Can block delivery. |
| **Cost** | ~$0.90 of the ~$10.50 modeled COGS per milestone (§7). Roughly 9% of cost for the entire value proposition. |

## Decision

**Verification is enforced by code and data constraints, at three independent layers. No verification
control may depend on a model following an instruction.**

### The rules

1. **Independent review.** The Code Reviewer runs as a separate agent instance, in a separate session,
   with no authorship context and a **read-only tool allowlist**.

2. **Self-review is impossible, enforced three times:**

   | Layer | Mechanism |
   |---|---|
   | Orchestrator | Refuses to dispatch a review task to the run that authored the diff |
   | Policy engine | Denies the authorization |
   | Database | `CHECK (reviewer_run_id <> reviewed_run_id)` on the `reviews` table |

   Three layers because a single point of enforcement will eventually be bypassed by a refactor.

3. **Test results are machine-parsed, never self-reported.** The QA agent runs tests in the sandbox;
   the orchestrator parses real output. A claim of success without parseable output is treated as a
   failure.

4. **A milestone with failing tests cannot be marked complete. There is no override flag.** Not an
   admin setting, not a force parameter, not an autonomy level. `Blocked`, with the actual failure
   output attached.

5. **Reviewers report everything with severity and confidence; filtering happens in a separate step.**
   Instructing a reviewer to report "only significant issues" measurably suppresses real findings — the
   reviewer investigates just as thoroughly, finds the bug, then declines to mention it. Precision goes
   up while genuine recall goes down, which is exactly the wrong trade for us.

6. **Implementer prompts deliberately omit self-verification instructions.** Because verification is a
   structural gate, telling an implementer to "double-check your work" produces redundant work without
   adding assurance. This inverts a common prompting best practice, deliberately.

7. **Irreversible actions always require human approval**, at every autonomy level, non-configurable:
   production deploy, destructive migration, force push, data deletion, budget override.

8. **The seeded-defect eval suite is the product's health metric.** 25 diffs with known planted
   defects; the gate is ≥ 80% detection with ≤ 20% false positives. **A regression here is a product
   emergency regardless of every other metric.**

## Consequences

### Positive

- The core product claim is *true and demonstrable*, not marketing.
- The guarantee survives prompt injection: a subverted reviewer still cannot approve its own work,
  because the constraint isn't in the prompt.
- Every milestone produces an auditable verification artifact — which is also what enterprise buyers
  need.
- The seeded-defect metric gives us a direct, quantitative measure of whether the product works,
  independent of customer anecdote.
- It creates a defensible difference from competitors positioned as "one autonomous engineer," for whom
  independent review is architecturally awkward to add later.

### Negative

- **Costs roughly 9% of per-milestone COGS** for the review run. Accepted without argument.
- Adds latency to every milestone.
- Orchestration is meaningfully more complex: separate sessions, loop-back on failure, bounded retries,
  quarantine.
- Can block delivery when the customer wants shipping. **This is the feature, and it must be defended
  in the moment it becomes inconvenient.**
- False positives from the reviewer cost real time. Managed by tracking the false-positive rate as a
  first-class metric rather than by loosening the reviewer.

### Neutral

- Higher autonomy levels change *who approves the merge*, never *whether review happened*.

## Reversal cost

**Very high — and deliberately so.** Reversing this doesn't just change an implementation; it
invalidates the product's positioning, its enterprise story, and its differentiation. The three-layer
enforcement exists partly to make casual erosion structurally difficult.

If a future decision-maker wants to relax this, that requires a superseding ADR that explicitly states
what the product's claim becomes instead.

## Revisit triggers

The only legitimate triggers are evidentiary, not commercial:

- Seeded-defect detection is high enough that a cheaper mechanism would suffice — i.e. we have *data*
  that a weaker gate performs equivalently.
- False-positive rate exceeds 30% sustained, harming throughput more than the findings are worth
  (response: improve the reviewer, not remove it).
- Verification cost exceeds 25% of per-milestone COGS (response: re-tier the reviewer's model, not
  remove the gate).

**"It's slowing us down" and "the customer wants it shipped" are explicitly not valid triggers.**

## Related

- [§1 Product Vision](../00-foundation/01-product-vision.md)
- [§2 Mission Statement](../00-foundation/02-mission.md)
- [§13 Agent Architecture](../02-architecture/13-agent-architecture.md)
- [§15 Database Strategy](../02-architecture/15-database-strategy.md) — the `reviews` CHECK constraint
- [§23 Testing Strategy](../04-engineering/23-testing-strategy.md) — the eval corpus
- Backlog M043, M044, M045, M079
