# ADR-011 — Resend for transactional email, behind an EmailPort

**Status:** Accepted
**Date:** 2026-07-29
**Deciders:** Project owner; Lead Architect

## Context

FR-AUTH-4 (email verification required before an agent run) and FR-AUTH-5 (password reset via a
single-use, time-limited, revocable token) are both P0, and both require delivering mail. §14 names
a technology for every other layer and is silent on email — the requirement was written without a
provider behind it.

Two properties matter more than the provider choice itself:

1. **Deliverability is the product.** A verification email in a spam folder is a user who cannot use
   the platform, and it fails silently — no error, no log, just a funnel that leaks.
2. **The provider is a detail that will change.** Email vendors get acquired, reprice, and hit
   deliverability incidents. Whatever we pick must be replaceable without touching the auth flows.

The owner's standing constraint from ADR-009 applies: *"Keep infrastructure costs as low as possible
during development… Optimize for rapid iteration, maintainability, and low operational cost."*

What we did not know: our eventual sending volume, or whether marketing email (a different problem,
usually a different vendor) will ever share this path.

## Options considered

### Option A — Resend

| | |
|---|---|
| **Advantages** | 3,000 emails/month and 100/day on the free tier, which covers development and early staging outright. First-class TypeScript SDK. React Email for templates, so a message is a component rather than a string of HTML. Setup is a DNS record and an API key. Built by people who care about DX and it shows. |
| **Disadvantages** | Youngest of the three (2023). Smaller deliverability reputation than Postmark, which is the one thing that is genuinely hard to build. Free tier means no contractual deliverability guarantee. |
| **Alternatives within this option** | Resend's SMTP interface instead of the SDK — rejected; the SDK gives typed errors and idempotency keys that SMTP does not. |
| **Scalability** | Ample: paid tiers reach millions/month. Volume is not the axis that will force a change. |
| **Community** | Large and active; the default recommendation in the TypeScript ecosystem as of 2026. |
| **Maintenance** | Minimal — one adapter file. |
| **Licensing** | Proprietary service; MIT SDK. |
| **Cost** | **$0** at expected M014 volume. $20/month at 50k emails. |
| **Future-proofing** | Good for transactional. Not a marketing-email product; if that need arrives it is a separate vendor either way. |

### Option B — Postmark

| | |
|---|---|
| **Advantages** | The best transactional deliverability available, by reputation and by their refusal to send bulk marketing mail on the same infrastructure — which is *why* it is the best. Excellent per-message diagnostics. |
| **Disadvantages** | No free tier beyond 100 test sends. ~$15/month from day one for volume we do not have. Older, less pleasant SDK. |
| **Alternatives within this option** | — |
| **Scalability** | Excellent. |
| **Community** | Mature, stable, well regarded. |
| **Maintenance** | Minimal. |
| **Licensing** | Proprietary. |
| **Cost** | ~$15/month immediately, for ~0 emails during M014. |
| **Future-proofing** | The right answer *if and when* verification deliverability becomes a measured problem. |

### Option C — AWS SES

| | |
|---|---|
| **Advantages** | Cheapest at scale by an order of magnitude ($0.10 per 1,000). |
| **Disadvantages** | Worst developer experience of the three. Starts in a sandbox that only sends to verified addresses, and leaving it requires a support request describing your sending practices — a human-latency blocker in the middle of a milestone. Deliverability is your problem: warming, bounce handling, complaint loops are all yours to operate. |
| **Alternatives within this option** | — |
| **Scalability** | Best. |
| **Community** | Large but AWS-shaped. |
| **Maintenance** | Highest — you operate the reputation. |
| **Licensing** | Proprietary. |
| **Cost** | Near zero per message; real cost is engineering time. |
| **Future-proofing** | Where this lands eventually if email volume becomes a line item. It is not one now. |

### Option D — Defer delivery; build the flow with a console adapter

| | |
|---|---|
| **Advantages** | Zero decision cost, zero vendor. All the security-critical logic — single-use, time-limited, revocable, constant-time comparison — is real and testable without a provider. |
| **Disadvantages** | FR-AUTH-4 and FR-AUTH-5 stay only partially met, so M014 could not honestly be called complete. Defers a decision that costs ten minutes to make. |
| **Alternatives within this option** | — |
| **Scalability** | — |
| **Community** | — |
| **Maintenance** | — |
| **Licensing** | — |
| **Cost** | Zero. |
| **Future-proofing** | Neutral — this is the adapter we build anyway for dev and test. |

## Decision

**Option A — Resend**, reached through an `EmailPort` interface in `packages/domain/src/ports/`,
alongside the existing `Clock` port.

The port is not ceremony. It is what makes Option A reversible: the provider is one adapter file, so
choosing Resend now does not foreclose Postmark later if deliverability turns out to matter more
than cost. Option D's console adapter is built regardless — it is what dev and test use, and it is
what keeps the test suite from needing network access or a vendor account.

Domain code depends on `EmailPort` and never on Resend. ADR-001's boundary rules already forbid
`packages/domain` importing an SDK, so this is enforced by `depcruise` rather than by discipline.

## Consequences

**Positive**

- No infrastructure cost during development.
- Swapping providers is one file and cannot leak into the auth flows, because those flows only ever
  see the port.
- Tests never touch the network: the console adapter records what would have been sent, which makes
  "did the reset email contain a single-use token" an ordinary assertion.

**Negative**

- A new secret, `RESEND_API_KEY`, added to `SECRET_VARIABLES` so it is never echoed in an error.
- Deliverability now depends on a vendor whose reputation is younger than Postmark's. Accepted
  deliberately: the cost of being wrong is a provider swap, and the port is what keeps that cheap.
- Sending domain DNS (SPF/DKIM) is owner-gated and cannot be done from a development machine.

**Neutral / to revisit**

- Revisit if verification-email delivery rate becomes measurable and disappointing. The trigger is
  data, not a hunch; until there is a funnel to measure, Postmark's advantage is theoretical.
- Marketing email is explicitly out of scope for this decision and should not be routed through this
  port — mixing bulk and transactional on one sending reputation is what makes deliverability bad.

## Related

- [ADR-010](ADR-010-authentication-identity-boundary.md) — the other M014 decision
- [ADR-001](ADR-001-typescript-monorepo.md) — boundary enforcement that keeps the port honest
- [§14 Technology Stack](../02-architecture/14-technology-stack.md) — amended by this ADR, which
  fills a gap rather than contradicting a choice
