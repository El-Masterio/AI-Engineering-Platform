# Assumptions Register

This blueprint was authored without owner input on several material questions. Rather than presenting
guesses as facts, each is recorded here with its impact if wrong and its resolution path.

**Status:** `Open` (unvalidated) · `Validated` · `Invalidated` (with the correction) · `Resolved` (owner decided)

| ID | Assumption | Impact if wrong | How it gets resolved | Status |
|---|---|---|---|---|
| **001** | "Atelier" as the product name | None architecturally — a find-and-replace plus a token change | Owner names the product | Open |
| **002** | Market sizing reasoned from structure, not primary research (§4) | **High.** Could mis-target the beachhead segment and mis-price the product | Primary research before any fundraise or pricing commitment. Interview 20 agencies. | Open |
| **003** | Competitor capabilities as of early-to-mid 2026 (§5) | Medium. Positioning could target a gap a competitor already closed | Verify each claim before it appears in sales material; quarterly review per §5 | Open |
| **004** | Unit economics modeled, not measured (§7) | **High.** Pricing and margin targets rest on it | **M050 instruments this.** Replace all figures at the P1 gate. | Open |
| **005** | Phase durations (§9) | Medium. Affects planning and any external commitments | Recalibrate after Stage 1A ships and real velocity is known | Open |
| **006** | MVP scale of ≤ 50 orgs / ≤ 200 concurrent runs (§11) | Low. Over-engineering risk if too low, capacity risk if too high | Design-partner recruitment reveals the real number | Open |
| **007** | One-level agent delegation is both our design and a runtime constraint (§13) | Low. If the runtime allows deeper delegation we simply don't use it | Confirmed at M026 | Open |
| **008** | Technology version numbers current at authoring (§14) | Low. Pins need refreshing | Re-check at M001 | Open |
| **009** | Team size of 2–4 engineers plus agent assistance (§25) | **High.** Every duration estimate scales with it | Owner confirms team composition | Open |
| **010** | Model pricing current at authoring (ADR-004) | Medium. Directly affects COGS modeling | Re-verify at M034; monitor continuously | Open |

## Assumptions that most need owner input

Ordered by how much the answer changes the plan:

1. **Team size and composition (009).** Every timeline in §25 is a function of this. A one-person team
   and a four-person team produce very different roadmaps from the same backlog.
2. **Market and pricing research (002, 004).** The revenue model's *structure* is sound — subscription
   plus metered credits with visible estimates — but the numbers are modeled. Do not commit to a price
   externally on this basis.
3. **Product name (001).** Trivial to change now; annoying to change after a marketing site exists.
4. **Whether enterprise arrives early (affects 002 and ADR-010 pending decision).** If real enterprise
   demand shows up before Phase 6, the auth choice (Better Auth vs. WorkOS) and residency work move
   forward substantially.

## How to use this register

- Anyone may add an assumption. New entries get the next ID and are never renumbered.
- When an assumption is validated or invalidated, update the row **and** the section that relied on it.
- An `Invalidated` assumption that hasn't yet propagated to the affected documents is treated as
  technical debt with a fired trigger (§28).
- Reviewed at every phase gate.

## Related

- [DECISION-LOG.md](DECISION-LOG.md)
- [§20 Documentation Structure](../04-engineering/20-documentation-structure.md)
- [§30 Master Development Plan](../05-delivery/30-master-development-plan.md) — "Where the blueprint is weakest"
