# ADR-002 — Claude Managed Agents as the execution plane, behind an `AgentRuntime` port

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Lead Architect (blueprint phase)

> This is the highest-leverage and highest-risk decision in the blueprint. It is documented at length
> because a future reader will need to judge it against what we knew, and because the exit ramp is
> part of the decision rather than an afterthought.

## Context

The product must execute untrusted, machine-generated code against customer repositories, with access
to customer credentials, for multiple tenants, reliably, for hours at a time. That requires four
capabilities:

1. **Hard multi-tenant sandbox isolation** — plain containers are a known-insufficient security
   boundary between mutually untrusted tenants.
2. **A durable, resumable agent loop** — sessions lasting minutes to hours, surviving control-plane
   restarts, with event streaming, interruption, and context compaction.
3. **Secret handling where the sandbox never sees a credential** — the single hardest security
   requirement in §17, and the one an incident would most likely stem from.
4. **Persistent, auditable, redactable memory** — required for both the product thesis (compounding
   knowledge) and GDPR erasure.

Building all four is roughly 12–18 months of platform engineering, plus a permanent
security-critical maintenance burden. None of it is visible to the customer, and none of it is our
differentiator — which is orchestration, verification, and governance.

**Constraint that dominates:** a small team pre-product-market-fit. Whatever we spend the runway on,
we cannot also spend on something else.

## Options considered

### Option A — Build our own execution plane (Firecracker/gVisor + custom harness)

| | |
|---|---|
| **Advantages** | Total control. No vendor concentration. Can offer zero-data-retention and air-gapped deployment from day one. Sandbox internals tunable. No per-sandbox vendor cost. |
| **Disadvantages** | 12–18 months before parity. Permanent security-critical maintenance on a microVM fleet. Requires specialist expertise we don't have and would need to hire. We would be building a worse version of a commodity while a competitor builds product. |
| **Scalability** | Excellent, eventually. We'd own capacity planning and elasticity. |
| **Community** | Firecracker/gVisor are mature with real communities. Our harness would be bespoke. |
| **Maintenance** | Very high, and it never ends. A sandbox escape in our own code is our incident. |
| **Licensing** | Apache-2.0 components. Clean. |
| **Cost** | Low marginal compute cost; enormous engineering cost; ongoing specialist headcount. |
| **Future-proofing** | Strong on control, weak on opportunity cost. |

### Option B — Managed sandbox provider only (E2B, Daytona, Modal) + our own agent loop

| | |
|---|---|
| **Advantages** | Solves capability 1 (isolation). Multiple vendors exist, so less concentration risk. More control over the loop than Option C. |
| **Disadvantages** | We still build capabilities 2, 3, and 4 — the durable loop, credential-injection proxy, and memory store. Realistically 6–9 months. The credential proxy in particular is security-critical code we'd own. |
| **Scalability** | Good; managed. |
| **Community** | Growing; smaller vendors carry their own continuity risk. |
| **Maintenance** | Medium-high — we own the loop and the secret handling. |
| **Cost** | Sandbox compute plus our engineering time. |
| **Future-proofing** | Reasonable. Kept as the **primary fallback**. |

### Option C — Claude Managed Agents (hosted loop + sandbox + vault + memory)

| | |
|---|---|
| **Advantages** | Solves all four capabilities at once. Per-session isolated containers with configurable deny-by-default egress. Resumable hosted agent loop with event streaming, interrupts, and compaction. **Credential vault where secrets are substituted at egress and never enter the sandbox** — capability 3 solved by construction rather than by our code being correct. Versioned agent definitions. Memory stores with versioning and redaction. One-level multi-agent threads (which matches our §13 delegation model exactly). Cron deployments and webhooks. First-party support. |
| **Disadvantages** | **Vendor concentration on a critical path** — the serious one. Beta API surface subject to change. Minimum data-retention requirement blocks ZDR customers. Less control over sandbox internals. Pricing exposure. Per-organization rate limits to model. |
| **Scalability** | Managed and elastic; rate limits must be factored into capacity planning. |
| **Community** | Small (new surface), but first-party maintained. |
| **Maintenance** | Low for us. Tracking a beta API is real but bounded work. |
| **Licensing** | Commercial service terms. |
| **Cost** | Inference dominates; sandbox compute is a small share. Modeled in §7. |
| **Future-proofing** | Depends entirely on whether the abstraction we put in front of it actually holds. |

## Decision

**Adopt Claude Managed Agents as the execution plane for Phase 1, accessed exclusively through a
narrow `AgentRuntime` port that we own.**

The port is five methods:

```
defineAgent(spec)        → AgentRef
startRun(agentRef, ctx)  → RunHandle
sendEvent(run, event)
streamEvents(run)        → AsyncIterable<RunEvent>
interrupt(run)
```

No provider-specific type crosses that boundary. The orchestrator, the policy engine, and the domain
layer never import a provider SDK.

**Three commitments make this reversible rather than a one-way door:**

1. **A shared conformance suite.** Every adapter — the fake, the managed one, and any future one —
   passes the *same* test suite (M023, M026).
2. **A funded second implementation.** M127 builds a self-hosted adapter in Phase 7 and **must pass
   the same conformance suite**. This is a P7 gate criterion, not a stretch goal.
3. **Option B stays warm as the documented fallback.** If the managed runtime fails us before Phase 7,
   we move to a sandbox-only provider plus our own loop, and we already know what that costs.

The reasoning in one line: **we are a small team whose differentiator is orchestration, verification,
and governance — not sandbox engineering.** Building the execution plane would consume the runway to
reach parity on something customers cannot see.

## Consequences

### Positive

- Roughly 12+ months of platform engineering avoided; that capacity goes to the orchestrator, the
  verification gates, and the governance layer — the things we actually sell.
- The hardest security requirement (secrets never in the sandbox) is satisfied by the platform's
  design rather than by our code being flawless. This meaningfully lowers our incident probability.
- Per-session container isolation gives us a defensible multi-tenant answer immediately, rather than
  after a year of microVM work.
- Memory stores with versioning and redaction directly satisfy FR-MEM-4/5 and the GDPR erasure path.
- The runtime's one-level delegation constraint happens to match our §13 design, so the platform
  enforces a rule we wanted anyway.
- Phase 7's self-hosted mode serves enterprise customers **without changing our code**.

### Negative

- **Vendor concentration on the critical path.** A price change, deprecation, terms change, or
  capacity limit hits us directly. This is R-05 in the risk register and it is real.
- Beta API surface: breaking changes are likely and must be absorbed.
- **No zero-data-retention in Phase 1.** Some enterprise prospects are unservable until M127. We
  disclose this rather than discover it in a security review.
- Less visibility into sandbox internals when debugging.
- Rate limits are an external constraint on our scaling story.
- Some risk that the abstraction leaks in ways we don't anticipate until M127 tests it — which is
  precisely why M127 is scheduled and gated rather than aspirational.

### Neutral

- Model choice and runtime choice are now coupled to one provider. §14 and ADR-004 keep model
  selection behind a tier abstraction so those can be decoupled independently.

## Reversal cost

**Medium — deliberately engineered down from High.**

| What would change | Effort |
|---|---|
| Write a new `AgentRuntime` adapter | 4–8 weeks |
| Build sandbox provisioning if moving to Option A | 6–12 months |
| Build credential-injection proxy | 4–8 weeks (security-critical) |
| Build memory store equivalent | 3–6 weeks |
| Orchestrator, policy engine, domain, UI | **Unchanged** — this is the point |

**Exit ramp:** M127's self-hosted adapter, passing the shared conformance suite, *is* the exit ramp
and it is on the roadmap. If it passes, reversal is a matter of writing a third adapter. If it
doesn't, we have learned in Phase 7 rather than in a crisis — and we will have learned it while the
managed runtime is still working.

## Revisit triggers

- A breaking runtime API change we cannot absorb within one sprint.
- Runtime pricing changes by more than 30%.
- We hit a hard capacity or rate limit that constrains customer growth.
- **Stage 1C (M026) reveals the runtime cannot meet a §11 or §17 requirement** — this triggers
  immediate re-planning per §25, not a workaround.
- Two or more enterprise deals lost specifically on the ZDR gap.
- M127 fails the conformance suite — meaning the abstraction did not hold, and we need to widen the
  port or reconsider the layer.

## Related

- [§12 System Architecture](../02-architecture/12-system-architecture.md)
- [§13 Agent Architecture](../02-architecture/13-agent-architecture.md)
- [§14 Technology Stack §8](../02-architecture/14-technology-stack.md)
- [§17 Security Strategy](../02-architecture/17-security-strategy.md)
- [§27 Risk Analysis](../05-delivery/27-risk-analysis.md) — R-05
- Backlog M023, M026, M027, M127
