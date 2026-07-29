# ADR-012 — The AgentRuntime port

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Project owner (design review); Lead Architect

## Context

[ADR-002](ADR-002-managed-agents-runtime.md) bet the platform on Claude Managed Agents: a hosted
agent loop, a hosted sandbox, and a credential vault. It rated its own reversal cost **"Medium —
deliberately engineered down from High"**, and the mechanism it named for that reduction is this
port. §12 sketched five methods; §13 defined the agent specification; M127 is scheduled to write a
self-hosted adapter whose passing of a shared conformance suite *is* the exit ramp.

So this milestone is not "write an interface". It is the load-bearing structural commitment of the
whole program, and the backlog flagged it for design review before implementation for that reason.

Two forces pull against each other:

- **Narrow** — every method is one more thing a second adapter must reproduce. A wide port is an exit
  ramp nobody can walk, which is the same as having no exit ramp while believing you do.
- **Sufficient** — a port that omits something the orchestrator needs gets bypassed. The first
  `if (runtime instanceof ManagedRuntime)` is the moment the abstraction stops existing, and it will
  be written by someone reasonable solving a real problem.

What we did not know at decision time: whether the managed runtime exposes a pre-execution hook for
tool calls. That gap shaped the third decision below.

## Decisions

### 1. Five methods, and nothing else

`defineAgent`, `startRun`, `sendEvent`, `streamEvents`, `interrupt` — exactly §12's list.

Deliberately absent: listing runs (our database owns that), fetching usage (it arrives as an event),
configuring a model (ADR-004 resolves a tier *inside* an adapter), and reading the sandbox filesystem
(the repository is mounted; reaching in from outside would make the sandbox boundary advisory).

### 2. No provider type crosses the seam, and a test enforces it

`AgentSpec.model` is `{ tier, effort }`, never a model id — §13 writes `tier: implementation` because
ADR-004 owns the mapping. `RunEvent` is our own discriminated union. Usage is
`{ inputTokens, outputTokens, cachedInputTokens }`.

The acceptance criterion says "the port has no provider-specific types", and prose cannot hold that.
`port-purity.test.ts` reads the interface files and fails on a vendor name or a provider stream shape
(`content_block`, `stop_reason`, `max_tokens`). It also asserts the list of files it checks matches
what is on disk — a new interface file that nobody added to the list would otherwise be unchecked
while the test still passed.

### 3. Tool enforcement is declared, streamed, and vetoed where possible

§13 requires the allowlist to be "enforced by the orchestrator, not by the model's cooperation".
ADR-002 chose a runtime that executes tools inside its own sandbox, so a mandatory pre-execution veto
might be unimplementable — and a required method no adapter can implement blocks the milestone on a
capability nobody has verified.

Three layers instead:

1. **Declared.** The allowlist is in the spec; the runtime enforces it.
2. **Streamed.** Every call is emitted as `tool_call` *before* its result, so the orchestrator checks
   it against the spec independently and interrupts on a violation.
3. **Vetoed where supported.** `vetoTool` is optional. Where an adapter offers it, a violation is
   prevented rather than detected.

The conformance suite asserts both paths, and `RuntimeCapabilities.supportsToolVeto` must match
whether `vetoTool` exists — so an adapter cannot over-claim to skip a test or under-claim to hide a
capability.

### 4. `streamEvents` resumes from a cursor, exclusively

§12 requires the Realtime Gateway to replay from history because "an SSE stream has no built-in
replay". That is impossible unless the *port* can resume, so `{ after?: EventCursor }` is in the
signature from the first line rather than bolted on after the first dropped connection loses events.

Two properties the suite pins down, both of which are easy to get wrong in a way that looks fine:

- **Omitting the cursor replays from the beginning, not from now.** A reconnecting consumer given only
  future events silently loses exactly the window it was disconnected for.
- **The cursor is exclusive.** Replaying the cursor's own event double-processes it — and for a
  `usage` event that is a double charge on every reconnect.

## Consequences

**Positive**

- ADR-002's reversal cost stays Medium, because the thing it depends on now exists and is tested.
- The fake adapter unblocks every downstream milestone: the orchestrator (M037+) can be built and
  tested without a model call, a network, or a bill.
- Provider drift becomes a build failure rather than an archaeology exercise.

**Negative**

- A narrow port will occasionally be *too* narrow. Widening it is the correct response and it is a
  real cost — every addition is work for every adapter, including the one that does not exist yet.
- `vetoTool` being optional means the strength of tool enforcement varies by adapter. That is honest
  rather than convenient, and `capabilities` makes it visible instead of implicit.
- The fake is a second implementation to maintain. That is the price of a suite with teeth: a suite
  that only ever ran against the managed adapter could not distinguish "the adapter is correct" from
  "the suite asserts nothing".

**Neutral**

- `AgentRef` is opaque and branded, so an adapter may key it however it likes.

## Reversal cost

**Low.** This is an interface plus a fake plus a test suite. Changing it costs the adapters that
implement it — one today, two by Phase 7. Widening the port is a normal change; *narrowing* it after
adapters exist is the expensive direction, which is the argument for starting narrow.

## Revisit triggers

- **The orchestrator needs something the port cannot express.** The correct response is to widen the
  port, never to reach around it — and the tell is the first `instanceof` check against a concrete
  adapter.
- **M127's self-hosted adapter cannot pass the conformance suite.** ADR-002 already lists this as one
  of its own triggers: it means the abstraction did not hold, and the layer is wrong rather than the
  adapter.
- **The managed runtime gains a pre-execution tool hook.** Then `vetoTool` should become required and
  decision 3 collapses from three layers to two.
- **A second adapter passes the suite while breaking the orchestrator.** The suite is then too weak,
  and the specific behaviour that differed becomes a new conformance test before anything else
  happens.

## Related

- [ADR-002](ADR-002-managed-agents-runtime.md) — the bet this port makes reversible
- [ADR-004](ADR-004-model-tiering.md) — owns the tier → model mapping the port refuses to know
- [ADR-005](ADR-005-skills-as-capability-format.md) — capability packs referenced by `AgentSpec`
- [§12 System Architecture](../02-architecture/12-system-architecture.md) — the five methods
- [§13 Agent Architecture](../02-architecture/13-agent-architecture.md) — the specification
