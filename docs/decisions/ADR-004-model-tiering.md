# ADR-004 — Model tiering by task class, resolved at runtime

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Lead Architect (blueprint phase)

## Context

Inference is our cost of goods sold (§7). A single agent run may consume millions of input tokens and
hundreds of thousands of output tokens. Output tokens cost 3–5× input tokens, and cached input reads
cost roughly 0.1× uncached.

At the same time, task classes have genuinely different capability requirements. Planning a system
architecture and formatting a changelog are not the same problem, and paying frontier prices for the
second is pure margin loss.

New models also ship frequently. Any design that scatters model IDs through the codebase turns each
model launch into a repository-wide edit plus an untestable behavioral change.

`ASSUMPTION-010`: prices below were current at authoring and must be re-verified at M034. The *tier
structure* is the decision; the specific model assignments are configuration.

## Options considered

### Option A — Single model for everything

| | |
|---|---|
| **Advantages** | Simplest. One prompt-tuning target. One eval baseline. Prompt caches never fragment. |
| **Disadvantages** | Either we overpay on volume work (using a reasoning-tier model for summarization) or underperform on hard work (using a cheap model for architecture). At our token volumes the overpay case is roughly 2× on the largest cost bucket. |
| **Cost** | Worst of the options. |

### Option B — Hardcoded model IDs per agent

| | |
|---|---|
| **Advantages** | Explicit and obvious when reading an agent definition. |
| **Disadvantages** | Every model launch is a change across every agent definition, with no single place to test the migration. Provider switching becomes a repo-wide edit. Cost policy is not centrally visible or adjustable. |
| **Future-proofing** | Poor. |

### Option C — Named tiers resolved at runtime

| | |
|---|---|
| **Advantages** | One mapping table is the entire model policy. A model migration is a config change plus one eval run. Cost policy is visible and adjustable in one place. Provider abstraction comes for free. Agent definitions express *intent* ("this needs reasoning") rather than an implementation detail. |
| **Disadvantages** | One layer of indirection when debugging. Tier boundaries require judgment and must be revisited as models change. |
| **Cost** | Best. Enables per-tier optimization. |
| **Future-proofing** | Strong. |

## Decision

**Four named tiers, resolved at runtime from a single mapping table. No model ID appears anywhere else
in the codebase — enforced by lint.**

| Tier | Task classes | Current model | Effort | Rationale |
|---|---|---|---|---|
| **reasoning** | Planning, architecture, code review, security review, ADR authoring | Claude Opus 5 ($5/$25 per MTok) | `high` / `xhigh` for agentic | Quality here determines everything downstream. Cheapest place in the system to spend money. |
| **implementation** | Code generation, test authoring, refactoring | Claude Sonnet 5 ($3/$15; $2/$10 intro through 2026-08-31) | `high` | Largest token bucket by far. ~40–45% cheaper than reasoning tier at near-equivalent coding quality. |
| **utility** | Summarization, classification, doc formatting, indexing, routing | Claude Haiku 4.5 ($1/$5) | n/a | Volume work where capability is not the constraint. |
| **frontier** | Exceptional reasoning — **explicit escalation only, never a default** | Claude Fable 5 ($10/$50) | `xhigh` / `max` | Priced above Opus. Requires an explicit escalation decision and is budget-gated. |

### Mandatory accompanying controls

These are part of the decision, not separate:

1. **Prompt-cache stability.** Nothing volatile is interpolated into a system prompt; dynamic context
   is appended as messages. At 0.1× read cost, the gap between 60% and 90% cache hit rate is roughly
   2× on input spend. (M035.)
2. **Tier is fixed for a session.** Caches are model-scoped, so switching tier mid-session discards
   the cache. Cheaper sub-work goes to a separate session, not a mid-session model switch.
3. **Per-run token budgets and task budgets** so the model paces itself and finishes gracefully. (M033.)
4. **Batch API for non-interactive work** — 50% discount on documentation, summarization, indexing.
5. **Refusal fallback configured on every reasoning-tier call.** Safety classifiers can decline benign
   security-adjacent work; `stop_reason` is checked before reading content.
6. **Effort as a tuned parameter, not a default.** Effort is swept per task class against the eval
   corpus; lower effort is often equal-quality and materially cheaper.
7. **Verbosity governance.** Output tokens cost 3–5× input; explicit conciseness instructions in agent
   prompts are a margin control, not a style preference.

### Migration protocol

When a new model ships:

1. Update the mapping table for one tier, in a branch.
2. Run the full eval corpus (§23 Layer 5) against the baseline.
3. **Delete prior model-specific prompt workarounds and re-measure before re-adding any.** Workarounds
   written for an older model generation frequently become counterproductive on a newer one — this is
   a real and easily-missed maintenance obligation (D-debt in §28).
4. Compare cost per completed task, not just quality scores.
5. Ship only on no significant regression.

## Consequences

### Positive

- Model policy is one file. A migration is a config change plus an eval run.
- Roughly 40–45% cost reduction on the largest token bucket versus using reasoning tier everywhere.
- Provider abstraction is a side effect — multi-provider becomes a mapping change, not a refactor.
- Agent definitions read as intent, which makes them reviewable by non-specialists.

### Negative

- Indirection when debugging ("which model actually ran?") — mitigated by recording the resolved model
  ID on every `agent_run` row.
- Tier boundaries need periodic re-judgment as model capabilities shift.
- Fragmenting work across tiers means multiple eval baselines to maintain.

### Neutral

- Frontier tier exists but is expected to be rarely used. Its value is having a defined escalation path
  rather than an ad-hoc override.

## Reversal cost

**Low.** Changing the mapping is configuration. Changing the *tier structure* is a moderate refactor of
agent definitions, but agent definitions are data, so it's a data migration rather than a code change.

## Revisit triggers

- Any new model release (triggers the migration protocol, not necessarily a tier change).
- Measured COGS per accepted milestone exceeding $20.
- A tier's eval scores regressing against baseline.
- A competitor model clearly outperforming on a specific task class.
- Provider pricing change greater than 20%.

## Related

- [§7 Revenue Model](../00-foundation/07-revenue-model.md)
- [§13 Agent Architecture](../02-architecture/13-agent-architecture.md)
- [§14 Technology Stack §9](../02-architecture/14-technology-stack.md)
- Backlog M034, M035, M050
