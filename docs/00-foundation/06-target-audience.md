# 6. Target Audience

## Segmentation with intent

The nine audiences named in the governing spec are all real, but they are not equally valuable at
equal cost. This section ranks them by **acquisition priority** so that product decisions have a
tiebreaker.

| Tier | Segment | Why this tier |
|---|---|---|
| **T1 — Beachhead** | Software agencies (2–20 people) | Feels every pain acutely, buys in weeks, our differentiators are immediately legible, high referral density |
| **T1 — Beachhead** | Technical founders / solo builders shipping real products | Fast self-serve conversion, tolerant of rough edges, loud advocates |
| **T2 — Expansion** | Startups (seed–Series B) | Same product, budget authority, needs teams + RBAC |
| **T2 — Expansion** | Freelancers | Volume and word-of-mouth; low ACV, so must be fully self-serve |
| **T3 — Upmarket** | Mid-market internal software teams | Requires SSO, audit, analytics; long-ish cycle; strong retention |
| **T3 — Upmarket** | Enterprise engineering orgs | Highest ACV, highest cost of entry (SOC 2, residency, procurement) |
| **T4 — Strategic / low priority** | Students, researchers, non-profits | Low revenue; valuable for goodwill, education pipeline, and free-tier feedback |

**Product implication:** every roadmap tie is broken in favor of T1. Enterprise-only features
(SCIM, residency, on-prem execution) are architected for early but *built* in Phase 7.

---

## Primary personas

### P1 — Marco, agency technical director *(beachhead — design for him first)*

- Runs delivery at a 9-person agency. 4–6 concurrent client projects.
- Codes maybe 20% of the time; the rest is scoping, review, and firefighting.
- Fixed-price contracts. Margin dies on scope creep and rework.

**What he needs:** repeatable quality across projects and junior staff; a defensible artifact trail
to show clients; cost visibility per project so fixed-price bids stay profitable; the ability to
encode "how we build things here" once and have it enforced everywhere.

**What kills the sale:** if output quality varies unpredictably between projects, or if he can't
explain to a client what the AI did.

**Killer feature for him:** organization-level capability packs + per-project cost ledger.

---

### P2 — Priya, technical founder

- Solo or with one other engineer. Pre-seed to seed.
- Building the product *and* doing everything else.
- Speed is existential; quality matters only insofar as it doesn't slow her down later.

**What she needs:** to hand off entire features and get back something she doesn't have to rewrite;
tests she didn't have to write; architecture that won't trap her in six months.

**What kills the sale:** slow time-to-first-value. If she can't get a real result in her first
session, she's gone.

**Killer feature for her:** goal → approved plan → delivered, reviewed, tested increment with no
babysitting.

---

### P3 — David, enterprise engineering manager *(Phase 7 buyer, but constrains architecture now)*

- Manages 3 teams, ~25 engineers, in a regulated industry.
- Cannot adopt anything his security and compliance teams will not sign.

**What he needs:** SSO/SCIM, RBAC, immutable audit log, data residency, a DPA and sub-processor
list, guarantees that customer code and prompts are not used for training, per-team cost
allocation, and a documented answer to "what can the agent reach?"

**What kills the sale:** any one missing item on that list. Enterprise is a checklist, not a
preference.

**Why he matters now:** his checklist is why Section 17 (Security) and Section 11 (NFRs) are
written the way they are. Retrofitting audit logging and tenant isolation is a rewrite; adding SCIM
later is a sprint. We build the former in from M001 and defer the latter.

---

### P4 — Sam, freelance developer

- Juggles 2–4 small clients. Prices by project.
- Extremely price-sensitive; will not talk to sales, ever.

**What they need:** a low entry price, instant self-serve signup, and output good enough to bill for.

**Killer feature:** a genuinely useful free tier and predictable per-project cost.

---

### Secondary personas (served, not designed for)

- **Riya, CS student** — free/education tier. Value: pipeline and word-of-mouth; the platform's
  visible plans and ADRs are genuinely good pedagogy.
- **Dr. Chen, researcher** — needs reproducibility and export. Pinned agent versions and full run
  transcripts serve this without bespoke work.
- **Lena, internal-tools lead at a non-software company** — buys outcomes, not tooling. Highest
  need for guardrails and lowest tolerance for jargon. Watch this segment; it may become T2.

---

## Jobs to be done

Ranked by how often they'll be the reason someone signs up:

1. **"Turn this goal into a delivered, reviewed increment I don't have to rewrite."** *(core)*
2. **"Make my AI-generated code maintainable"** — tests, structure, docs on an existing mess.
3. **"Encode our standards so every project follows them."** *(agency retention driver)*
4. **"Tell me what this cost and what it will cost."**
5. **"Give me the artifacts to prove the work was done properly."** *(client- and audit-facing)*
6. **"Keep the project's context so I don't re-explain it every week."**
7. **"Let my team work on the same project without stepping on each other."** *(T2+)*
8. **"Deploy it and tell me when it breaks."** *(Phase 5)*

## Anti-personas — who we deliberately don't serve

Naming these prevents roadmap drift:

- **Non-technical users who want an app with no code involvement.** App builders serve them better.
  Our output is a repository; that only has value to someone who can read one.
- **Teams wanting a faster autocomplete.** Buy Cursor.
- **Teams wanting an agent framework to build on.** Buy nothing; use an SDK. (We'll offer an API in
  Phase 8 for the middle path.)
- **Anyone who needs zero-data-retention today.** Architecturally deferrable, not free. See
  [11. NFRs](../01-requirements/11-non-functional-requirements.md).

## Onboarding paths by segment

| Segment | Entry motion | First-value target |
|---|---|---|
| Agencies (T1) | Self-serve trial → guided "import an existing repo" → paid team plan | Reviewed increment on their real codebase, < 1 hour |
| Founders (T1) | Self-serve, credit-card, no call | Working feature from a goal, < 30 min |
| Freelancers (T2) | Free tier → usage-based upgrade | One usable deliverable on the free tier |
| Startups (T2) | Self-serve → sales-assisted on team expansion | Team collaborating on one project |
| Mid-market/Enterprise (T3) | Sales-led, security review first | Successful pilot on a non-critical service |

## Related

- [4. Market Analysis](04-market-analysis.md)
- [7. Revenue Model](07-revenue-model.md)
- [8. MVP Definition](08-mvp-definition.md)
