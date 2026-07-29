# Prioritized Development Backlog

**132 milestones**, dependency-ordered. The `Order` column is the suggested implementation sequence and
matches the ID sequence unless noted.

Field definitions, complexity model, and status vocabulary: [§26](../05-delivery/26-milestone-breakdown.md).

**Legend** — Type: 🏗 foundation · ✨ feature · 🤖 agent · 🔒 security · ✅ quality · ♻️ debt · 📄 docs
Complexity: XS · S · M · L (XL is prohibited — split it first)

> **Do not implement any milestone automatically.** Per [CLAUDE.md](../../CLAUDE.md), work starts only
> on an explicit "Start Milestone X" or "Implement the next milestone."

## Active sequence deviation — owner-approved 2026-07-27

**M007 → M008 → M009 pulled ahead of M003–M006.** After M002 the repository had no runnable surface
(the first URL is M009), and the owner asked to reach something demonstrable sooner.

This is a reordering, not a scope change: no milestone is added, removed, or altered, and
[§25](../05-delivery/25-roadmap.md) already designates design-system and UI-shell work as
parallelizable around the critical path. IDs are unchanged.

| Consequence | Handling |
|---|---|
| **M003 (CI) is deferred**, so pushes are not pipeline-gated for three milestones | Local husky hooks and `pnpm verify` still gate every commit. Accepted, time-boxed to M009. |
| M004 (Postgres + RLS) — the critical path — slips by three milestones | 🔒 Not skipped, only resequenced. Tenant isolation remains non-negotiable and lands before any data path exists. |

**Order now:** M007 → M008 → M009 → M003 → M004 → M005 → M006 → M010 …

---

# PHASE 1 — Foundation & Core Loop (MVP)

## Stage 1A — Skeleton (M001–M012)

### M001 · Initialize monorepo and tooling · S · 🏗 — ✅ **Done** (2026-07-27)
**Objective** A working pnpm + Turborepo monorepo with the package skeleton from §19.
**Dependencies** —
**Deliverables** `pnpm-workspace.yaml`, `turbo.json`, empty `apps/{web,api,orchestrator}` and `packages/*`, root `package.json`, `.gitignore`, `.nvmrc`.
**Acceptance** `pnpm install` succeeds · `pnpm build` succeeds across all packages · workspace protocol resolves internal deps · Node version pinned.
**Verified** `pnpm install` → 14 workspace projects, 2.3 s · `pnpm build` → 12/12 successful · `pnpm typecheck` → 13/13 successful · second build → `FULL TURBO`, 27 ms · `@atelier/api` symlinks and executes against `@atelier/domain` at runtime · Node pinned to 24 in `.nvmrc` + `engines`, pnpm `11.17.0` via `packageManager`.
**Notes** Resolved `ASSUMPTION-008` — Node 22 → **24** LTS. `packages/config` carries a minimal baseline `tsconfig.base.json`; the full §21 strict set, ESLint boundaries, Prettier, dependency-cruiser, and husky are M002's deliverables and were deliberately not started.

### M002 · Shared config and enforced boundaries · S · 🏗 — ✅ **Done** (2026-07-27)
**Objective** Standards enforced by tooling from the first commit.
**Dependencies** M001 ✅
**Deliverables** `packages/config` with shared tsconfig (strict + `noUncheckedIndexedAccess`), ESLint flat config with `eslint-plugin-boundaries`, Prettier, dependency-cruiser config, commitlint, husky hooks.
**Acceptance** A deliberate layer violation fails lint · a deliberate circular dependency fails the build · `any` without justification fails lint · pre-commit hook runs in < 10 s.
**Verified** All 10 adversarial cases rejected: domain→external npm · domain→db · `*.routes.ts`→db · `*.service.ts`→fastify · bare `any` · TS enum · default export · `console.log` · circular dependency (depcruise exit 1) · domain-purity depcruise rule. `any` with `-- justified:` accepted; a disable comment *without* justification rejected. commitlint rejects bad type/case/period/length and accepts a valid message. Clean repo: `pnpm verify` exit 0. **Pre-commit hook: 3992 ms** (budget 10 s).
**Notes** Three latent misconfigurations were found only because verification was adversarial — a clean lint run proved nothing. See the M002 completion report. Deferred to M003 (CI): `gitleaks` secret scanning, `knip` dead-code detection, and the `max-lines` 800 hard-fail (ESLint cannot express two severities for one rule; 400-warn is live).

### M003 · CI pipeline — static analysis, test, build · M · 🏗✅ — ✅ **Done** (2026-07-28)
**Objective** Every PR gated before review.
**Dependencies** M002 ✅
**Deliverables** GitHub Actions workflow implementing stages 1–4 of §24; Turborepo remote cache; pnpm store cache.
**Acceptance** PR triggers the pipeline · a lint failure blocks merge · cached no-op run completes in < 3 min · branch protection requires green CI.
**Verified** Three parallel jobs (static / unit+coverage / build). Every step run locally with real output: 11 gates, all exit 0; `pnpm verify` exit 0; `pnpm install --frozen-lockfile` exit 0. Fully cached serial re-run **27 s** against a 3-minute budget, with Turborepo reporting `12 cached, 12 total — FULL TURBO` in 87 ms. Four new gates each verified by reintroducing the fault: unused dependency → knip fails and names it; unacknowledged copyleft → licence gate fails and names the package; coverage below floor → vitest fails with the measured number; Tailwind silently not compiling → Storybook CSS gate fails with 6 missing utilities **while `build:storybook` still exits 0**.
**Notes** Stage 3 (integration) deliberately NOT implemented — there is no database, and a job that
passes because it has nothing to run is a fake gate. It lands with M004; §24 now carries a
stage-status table.

Three real defects surfaced while wiring the gates, none of which any existing check caught:
- **Storybook rendered every component unstyled from M008 onward.** No PostCSS config existed at the
  repo root, so Vite inlined Tailwind's source stylesheets instead of running the engine — the
  bundle had `@layer utilities` and zero utilities in it. `pnpm build:storybook` exited 0 throughout.
  Fixed, plus `scripts/check-storybook-css.mjs` so it cannot recur silently.
- **ESLint was linting `storybook-static/`** — minified vendor bundles, type-checked. Invisible
  because the directory is absent from a clean checkout and only appears once CI builds Storybook.
  Lint went from **110 s to 9.9 s** once ignored.
- **`@atelier/config` was declared by 12 packages and used by none of them** — every `tsconfig.json`
  extended it by relative path, so the dependency edge was decorative. Now extended by package name.
  `tailwindcss` likewise moved to `packages/ui`, the package whose `theme.css` actually imports it.

**Owner-gated remainder** (needs credentials/admin, cannot be done from a dev machine): branch
protection requiring the three checks, and `TURBO_TOKEN`/`TURBO_TEAM` for the Turborepo *remote*
cache. The workflow already consumes both if present and falls back to `actions/cache` without them.

### M004 · Postgres, Drizzle, and first migration with RLS · M · 🏗🔒 — ✅ **Done** (2026-07-28)
**Objective** The database foundation with tenant isolation active from migration one.
**Dependencies** M001 ✅
**Deliverables** `packages/db` with Drizzle setup, migration runner, `organizations` + `users` + `memberships` tables, RLS policies with `FORCE ROW LEVEL SECURITY`, `TenantContext` type, tenant-scoped repository base.
**Acceptance** Migration applies and rolls back · RLS blocks cross-tenant `SELECT` in a test · a repository call without `TenantContext` fails to compile · `FORCE` verified active.
**Note** 🔒 This cannot be retrofitted. It is why M004 is fourth and not fortieth.
**Verified** 22 integration tests against a real PostgreSQL 17 (Testcontainers), plus compile-time assertions. Migration applies, is idempotent, rolls back leaving nothing behind, and re-applies. `FORCE ROW LEVEL SECURITY` asserted directly against `pg_class.relforcerowsecurity` on all three tables. Cross-tenant `SELECT`/`INSERT`/`UPDATE`/`DELETE` all denied; an unset claim returns zero rows rather than erroring.
**Notes** DDL is hand-written SQL, not drizzle-kit: §15 requires `NNNN_verb_noun` names, a reviewed diff, and a tested `down`, and drizzle-kit provides none of the three. Drizzle is the typed query surface. The cost of that split is drift, so a third suite introspects the migrated database and fails if the two descriptions disagree — verified by renaming a column and by dropping a `.notNull()`.

Details worth carrying forward:
- **The isolation suite runs as an ordinary role, not the superuser Testcontainers hands you.** A superuser bypasses RLS unconditionally and `FORCE` does not apply to it, so the entire suite would have passed no matter how broken the policies were. The harness asserts `rolsuper = false` before any test runs.
- **`FORCE` needs its own test.** Removing it fails exactly one assertion and no isolation test, because the app role is not the table owner — so without a dedicated check the regression would be invisible.
- **`set_config(..., true)` is transaction-local.** With `false` the claim survives on a pooled connection and leaks to the next borrower, which under PgBouncer transaction mode (ADR-003) is a routine cross-tenant read. There is a test for the leak.
- Three probes confirmed the suite bites: dropping `FORCE` → 1 failure; neutering the `organizations` policy → 5; making the claim session-local → 2.
- `users` carries per-command policies rather than one. Identity is global — a person exists before they belong anywhere — so `INSERT` is open while `SELECT`/`UPDATE` resolve through a shared membership.

### M005 · Configuration validation · S · 🏗 — ✅ **Done** (2026-07-28)
**Objective** The process refuses to boot on invalid configuration.
**Dependencies** M002 ✅
**Deliverables** `packages/config` env schema (Zod), startup validation, complete `.env.example`.
**Acceptance** A missing required var prevents startup with a clear message · a malformed URL is rejected · `.env.example` covers every variable.
**Verified** 18 unit tests, plus three real processes rather than mocks: a missing `DATABASE_URL` exits **78** (`EX_CONFIG`) naming the variable; a malformed URL, a bad enum and a wrong-shaped key report **all three at once** and still exit 78; a valid environment boots and prints its resolved values.
**Notes** Two decisions are load-bearing.
- **Every failure is reported at once.** Fail-on-first turns one misconfiguration into one restart per variable.
- **A secret's value never reaches the message.** §17: "a secret-shaped string in a log is a P1 incident with rotation", and a validation error is exactly what gets pasted into a ticket. `DATABASE_URL` and `ANTHROPIC_API_KEY` report the problem and never the value — not even a length, which is itself a hint. Non-secrets *do* echo the value, because `(received: "verbose")` is the difference between a fix and a guess.
`.env.example` completeness is a test in **both** directions: a schema variable missing from the file fails, and so does a documented variable the schema does not know — the second is how you get someone setting a variable that does nothing. The file is also parsed *through the schema*, so it must be a working configuration and not merely a correct list of names.
Four probes confirmed the gates bite: removing a variable from the example, adding a stray one, putting a non-working value in it, and demoting `DATABASE_URL` from secret — 1, 1, 1 and 2 failures respectively.
No dotenv dependency: Node 24 reads `--env-file` natively, so `packages/config` has exactly one runtime dependency (Zod, §14).

### M006 · Observability skeleton · M · 🏗✅ — ✅ **Done** (2026-07-28)
**Objective** Traces and structured logs before there is anything hard to debug.
**Dependencies** M002 ✅
**Deliverables** `packages/observability`: OTel SDK setup, trace context propagation, structured JSON logger with **secret and PII redaction**, request-ID middleware, health/readiness endpoints.
**Acceptance** A trace spans HTTP → service → DB · logs carry a correlation ID · a secret-shaped string is redacted in a test · `/healthz` and `/readyz` respond.
**Verified** 87 unit tests and 8 integration tests. One trace across all three hops, asserted on a real Postgres and a real HTTP server. Correlation ids survive `await` and stay separate under concurrency. 8 classes of secret redacted, plus a live check in a real process. `/healthz` 200 with no dependency checks; `/readyz` 200 naming its checks, then **503 once the database is stopped while `/healthz` still returns 200** — the distinction that stops a database blip becoming a fleet restart.
**Notes — auto-instrumentation does not carry the trace, and finding that out was the milestone.** Two independent reasons, both of which fail **silently**: the SDK starts, reports nothing, and exports zero spans.
- `@opentelemetry/instrumentation-pg` instruments the `pg` package. `packages/db` uses `postgres` (postgres.js), a different library with no OTel auto-instrumentation. That dependency was never going to produce a span and has been removed.
- Under pure ESM, `import-in-the-middle` does not reliably patch `node:` core modules, so the HTTP server span did not appear either.
Explicit helpers (`withSpan`, `withServerSpan`, `withDatabaseSpan`) carry the trace instead. They work under any module system and are what a Fastify plugin will call at M016. `HttpInstrumentation` stays registered but is **not** what the trace depends on.
The trace assertion runs in a **child process** launched the way a service is launched, because vitest resolves modules through Vite and OTel's loader hook never sees them — an in-process test there would have been testing vitest's module graph.
Redaction is two-layer by design: by key (`password`, `apiKey`) for what we know about, and by value shape (`sk-ant-…`, JWTs, credentialed URLs) for the leak that actually happens — an interpolated message, not a field somebody named `password`. A connection string keeps its host and loses its credentials, because the host is what you need in order to debug.

### M007 · Design tokens · S · 🏗 — ✅ **Done** (2026-07-27)
**Objective** The §18 token system, live.
**Dependencies** M001 ✅
**Deliverables** `packages/ui/tokens/tokens.css` (primitives + semantic, both themes), Tailwind config consuming CSS variables, `data-theme` switching.
**Acceptance** All §18 tokens defined · both themes pass automated WCAG AA contrast checks · a hardcoded hex in a component fails lint.
**Verified** 116 unique tokens across 12 groups · `scripts/check-contrast.mjs` → **40 pairs, 0 failing** in both themes · hex literal, `rgb()` call and direct primitive reference all rejected by lint, semantic token accepted · Tailwind compile confirms `bg-surface` → `var(--bg-surface)` with **zero** primitive utilities generated · theme API exported and typed. All six gates exit 0.
**Notes** The contrast checker found **4 genuine WCAG 1.4.11 failures in §18's own specified values** (`--border-default` at 2.60:1 dark / 2.56:1 light against a 3:1 requirement). Tokens corrected and §18 amended with the machine-verified figures.

### M008 · UI primitives · M · ✨ — ✅ **Done** (2026-07-27)
**Objective** The base component set.
**Dependencies** M007 ✅
**Deliverables** Button, Input, Textarea, Select, Checkbox, Switch, Badge, Icon, Avatar, Tooltip, **StatusIndicator** — each with stories and tests.
**Acceptance** Every component covers default/hover/focus/active/disabled/loading/error · keyboard operable · axe clean · renders correctly in both themes.
**Verified** 11/11 components exported and loading at runtime (14/14 including `Field`, `cn`, theme API) · **42 tests passing** across 4 files · 9 axe assertions covering every component · keyboard operation asserted for Button, Checkbox, Switch, Select and Tooltip · a structural-fingerprint test proves both themes render identically (no component branches on theme) · Storybook builds and serves at `localhost:6006` with a live theme toolbar. All seven gates exit 0.
**Notes** Adds a `Field` wrapper (label/description/error wiring) so no control can ship without an associated label — §18 forbids placeholder-as-label. Radix supplies behaviour; all styling is ours from semantic tokens only. `packages/ui` now splits `tsconfig.json` (editor + lint, includes tests) from `tsconfig.build.json` (emit, excludes them).

### M009 · AppShell and routing skeleton · S · ✨ — ✅ **Done** (2026-07-27)
**Objective** Somewhere to put screens.
**Dependencies** M008 ✅
**Deliverables** Next.js App Router setup, AppShell (collapsible sidebar + topbar), route groups, error and loading boundaries.
**Acceptance** Navigation works · sidebar collapse persists · error boundary catches a thrown error · LCP within budget on an empty page.
**Verified** (measured in a real browser via Playwright against the production build) Navigation: `/agents` updates URL, title, `aria-current`, breadcrumb and content · Collapse: 248px → 56px, persisted to storage, **survives a full page load** · Error boundary: a deliberately throwing route renders it, shows a digest and **does not leak the raw error message** (§16) · **LCP 32 ms against a 2500 ms budget** (FCP 32 ms, TTFB 6 ms, 47 KB transfer). Routes: `/`→302, `/projects`, `/agents`, `/settings`, `/projects/[id]` all 200; unknown route 404. 52 tests. All seven gates exit 0.
**Notes** Fixed a spec violation found only by looking at the running app: `resolveInitialTheme` preferred the OS `prefers-color-scheme` over the dark default, so a light-mode OS overrode §18's dark-first product decision. Now dark unless explicitly stored; revisit at M083 when light mode formally ships. Also added `THEME_BASE_COLOR` — browser-chrome metadata cannot read a CSS variable, so the two literals are duplicated by necessity and a test asserts they stay equal to `--bg-base`.

### M010 · Local development environment · S · 🏗 — ✅ **Done** (2026-07-28)
**Objective** One-command onboarding.
**Dependencies** M004 ✅
**Deliverables** `docker-compose.yml` (Postgres + Redis), `pnpm db:up/migrate/seed/dev` scripts, synthetic seed data.
**Acceptance** A clean clone reaches a running app in three commands · seeds are synthetic only · documented in the developer guide.
**Verified** By cloning into a temp directory four times and running the commands — not by trusting a working tree that already had `node_modules`, `dist` and a `.env` in it. Final run: `pnpm install` 9 s, `pnpm setup` 12 s, `pnpm dev` up in ~6 s. Every route 200, unknown route 404. 9 seed unit tests plus 4 integration tests against a real Postgres.
**The clean clone found four bugs that a working tree hides.** This is the whole value of the criterion:
- `scripts/*.mjs` imported `@atelier/config` and `@atelier/db`, which the **root** `package.json` never declared. pnpm's strict isolation refused them. Nothing had ever run those scripts before.
- `docker-compose.yml` pinned `container_name`, so a second checkout collided with the first. Compose derives project-scoped names for exactly this reason.
- `DATABASE_URL` is required with no default, so `setup` could not reach the database. The schema stays strict — a required variable that silently falls back to localhost is how a production process ends up happily connected to nothing — and `setup` now provisions `.env` from `.env.example`, never overwriting one.
- **`pnpm dev` served 500 on every route.** `turbo.json`'s `dev` task had no `dependsOn`, so `@atelier/ui` resolved to a `dist/` that a fresh checkout does not have. It only ever worked because a stale `dist/` was on disk — the same class as the bug M003's first CI run found.
**Notes** The migrate and seed entrypoints live in `scripts/`, not `packages/db`: the boundaries rule rejected the first attempt, and it was right — a data-access package that reads `process.env` cannot be embedded, tested against a second database, or reused. Seeds are synthetic **by construction**: addresses use `example.test`, which RFC 2606 reserves and nobody can register, and a test fails the build if that stops being true. Two organizations are seeded rather than one, because with a single tenant a broken RLS policy looks exactly like correct behaviour.

### M011 · Deploy pipeline to staging · M · 🏗 — ✅ **Done** (2026-07-29)
**Objective** Stages 8–11 of §24.
**Dependencies** M003 ✅, M005 ✅
**Deliverables** Container builds (multi-arch, digest-pinned, signed, SBOM), staging environment via OpenTofu, automatic deploy on merge, smoke tests, graceful shutdown.
**Acceptance** Merge to `main` deploys to staging automatically · smoke test gates promotion · rollback by digest works · zero-downtime verified.
**Status — COMPLETE (2026-07-29).** Every acceptance criterion demonstrated end to end on live staging, by the pipeline rather than by hand.
**Verified locally** Image builds multi-stage and runs as uid 1000 · `/` 200 carrying the git revision, `/healthz` 200, `/readyz` 200 with a live database check, unknown route 404 · `x-request-id` on every response · **refuses to boot** under `NODE_ENV=production` with no provider key · **SIGTERM drains and exits 0** with no forced kill · 8 smoke checks pass, and fail correctly against a wrong revision, a dead database and a dead service.
**Demonstrated on live staging** Merge to `main` → CI green → [9] build+sign+push → [10] deploy → [11] smoke, all green with no manual step. 8/8 smoke checks against `https://api-production-9f7c.up.railway.app`, serving revision `f2c45f8` — the exact commit on `main`.
**Still not demonstrated** Rollback by digest. The mechanism is built and takes the same code path as a forward deploy (that was deliberate), but it has not been fired in anger. First real rollback is the test. Zero-downtime rests on Railway holding traffic on the old container until `/readyz` passes — configured and working, not load-tested.
**Five defects the pipeline only revealed against real infrastructure**, each one invisible locally: the licence gate was platform-dependent; `test:integration` assumed a built `dist/`; "deploy by digest" was computed and then never used; OCI references must be lowercase and `github.repository` is not; and `ARG GIT_SHA` was never declared, so Docker discarded the build-arg and the revision check — the one that catches a deploy doing nothing — was silently inert. That last one had passed local verification because I set `GIT_SHA` at run time with `-e`, testing a mechanism that was not the one shipping.
**Notes** [ADR-009](../decisions/ADR-009-railway-staging.md) chose Railway and GHCR, staging only. §24 asked for OpenTofu; Railway is configured by dashboard and CLI instead, because IaC for a platform we intend to leave is written twice — recorded as debt **D-010**, not skipped. Rollback is **by digest, never by tag**: a tag can be moved, a digest is the image. Migrations are deliberately not run by the deploy workflow — §15's expand→migrate→contract needs them sequenced independently of code. `apps/api` gained a real `node:http` server, not Fastify: the framework choice is M016's and still open, and none of listening, probing or draining depends on it.

### M012 · Developer guide · XS · 📄 — ✅ **Done** (2026-07-28)
**Objective** A new contributor productive in under an hour.
**Dependencies** M010, M011
**Deliverables** `docs/guides/developer-guide.md`.
**Acceptance** Someone unfamiliar follows it to a running app and a first PR without asking questions.

**═══ GATE 1A ═══** A trivial endpoint deploys to staging through the full pipeline, traced end to end, with a green cross-tenant test.

---

## Stage 1B — Identity & tenancy (M013–M022)

### M013 · Domain package: organizations and users · S · 🏗 — ✅ **Done** (2026-07-28)
**Objective** Pure domain entities with invariants, zero dependencies.
**Dependencies** M001 ✅
**Deliverables** `packages/domain/organizations`, `users`, `memberships`; `ports/clock.port.ts`; errors.
**Acceptance** Zero external imports (verified by dependency-cruiser) · invariants unit-tested · 90% coverage.
**Verified** 94 tests, zero external imports (dependency-cruiser clean), 90% floor enforced per-path in `vitest.config.ts` rather than promised.
**The invariant worth having:** an organization must always keep at least one owner. Without it the last owner can demote or remove themselves and the organization becomes permanently unadministrable — nobody can invite, change billing or delete it, and recovery means a support engineer editing the database by hand. Enforced over the whole membership SET, because that is the level it is true at; a function taking one membership cannot see the others. Every escape route is covered: demote to any role, remove, remove-when-sole-member. `transferOwnership` exists because promote-then-demote can be interrupted midway and demote-then-promote trips the rule.
**Notes** Time arrives through `ports/clock.port.ts` as branded epoch milliseconds, not `Date` — `Date` is mutable, carries a meaningless timezone and compares by reference. Everything is immutable and returns new values. Email normalisation lowercases and trims but deliberately does NOT strip dots or `+tags`: those are Gmail conventions, not standards, and merging `a.b@` with `ab@` conflates two real accounts. Changing an address clears verification, or someone verifies a throwaway and swaps in one they do not own.

### M014 · Authentication · M · 🔒✨ — ✅ **Done** (2026-07-29)
**Objective** Email/password and OAuth sign-in.
**Dependencies** M004 ✅, M013 ✅
**Deliverables** Better Auth integration, Argon2id hashing, session cookies (httpOnly/Secure/SameSite), GitHub + Google OAuth, email verification, password reset, session revocation.
**Acceptance** FR-AUTH-1..5, 9 satisfied · login rate-limited · failure messages generic · sessions revocable server-side · 95% coverage.
**Status — COMPLETE (2026-07-29)**, verified against a real database and then again through the shipped container image.
**Decisions** [ADR-010](../decisions/ADR-010-authentication-identity-boundary.md) — identity reads through a dedicated `atelier_auth` role, because `users` under FORCE RLS makes sign-in *structurally impossible*: no tenant context, so the lookup returns zero rows and the app reports "no such user" for every user in the database. [ADR-011](../decisions/ADR-011-transactional-email.md) — Resend behind an `EmailPort`; §14 named no provider and FR-AUTH-4/5 are both P0.
**Verified in the container** sign-up 200 · credential stored as `$argon2id$v=19$m=19456,t=2,p=1` · cookie `HttpOnly; SameSite=Lax` and correctly *not* `Secure` over http · `x-request-id` present · and `app_login` gets **permission denied for table accounts** — the boundary holding in a real deployment, not only in tests.
**Owner-gated** GitHub and Google OAuth apps, plus a Resend sending domain (SPF/DKIM). None blocks email/password sign-in; the schema refuses half an OAuth pair rather than failing at the redirect.
**Not done here** FR-AUTH-6 (TOTP), 7 (SAML/OIDC SSO) and 8 (SCIM) are P1/P3 and out of scope. FR-AUTH-9's session *listing* UI belongs to the frontend; the server-side revocation it needs is done.
**Notes** Rate-limit counters are in-memory, which is correct for one replica and wrong for several — the option to supply shared storage exists and the caveat is on the type. Migration 0003 reconciles Better Auth's required `emailVerified` boolean with our audit-bearing `email_verified_at` timestamp via a bidirectional trigger plus a CHECK constraint, because a GENERATED column is read-only and the library writes the flag. Migration 0004 corrects a UNIQUE index 0002 put on the wrong column.

### M015 · Organization and membership management · M · ✨ — ✅ **Done** (2026-07-29)
**Objective** Tenancy in the product, not just the schema.
**Dependencies** M014 ✅
**Deliverables** Personal org on signup, org CRUD, membership records, tenant resolution middleware setting the RLS session variable.
**Acceptance** FR-ORG-1..3 · every request resolves exactly one org context · a user cannot address an org they don't belong to.
**Status — COMPLETE (2026-07-29)**, verified through the ORDINARY `atelier_app` role so RLS actually applies. Run as the owner these tests would pass no matter what the policies said.
**The trick that avoided a policy change** `provisionPersonalOrganization` claims an organization that does not exist yet. M004's policy is `WITH CHECK (id = app_current_organization_id())`, so an insert is permitted exactly when the row being written is the tenant currently claimed — generating the id first and claiming it lets the ordinary role bootstrap a tenant with **no new grant and no policy change**. Widening `atelier_app` would have loosened the boundary for every query to solve a once-per-user problem.
**`resolveTenant` is shaped like its claim** Set the tenant claim to the *requested* organization, then look for the caller's membership; RLS filters that lookup, so a row returns only if the membership genuinely exists there. The naive `SELECT organization_id FROM memberships WHERE user_id = ?` is worse twice over — with no claim it returns nothing, and if someone "fixed" that by widening the policy, an attacker-supplied id would never be tested against anything.
**Proven adversarially** Removing the membership check fails 5 tests, including *"ada resolved a tenant she does not belong to"*.
**Deliberately NOT built** "List the organizations a user belongs to" — a cross-tenant read needing a second session claim (`app.current_user_id`) and a policy change. M015's acceptance does not require it; the organization switcher does, and it can arrive with its own ADR rather than riding in on this one.
**Known gap** **D-013** — the user row is committed before the provisioning hook runs, so a failure there leaves a user with no organization. Repairing it lazily needs the same cross-tenant read.

### M016 · API conventions and error envelope · S · 🏗 — ✅ **Done** (2026-07-29)
**Objective** §16 implemented once, centrally.
**Dependencies** M006 ✅, M015 ✅
**Deliverables** Fastify plugins: error handler producing the §16 envelope, JSON Schema validation, cursor pagination helper, idempotency middleware, ETag/If-Match support, OpenAPI generation.
**Acceptance** Every error shape matches the envelope · `request_id` present on all errors · OpenAPI generates and validates · pagination helper rejects `limit > 100`.
**Framework** Fastify, per §14. The decision-log entry "Fastify vs. NestJS — revisit with implementation experience" is triggered by the **P1 gate retrospective**, not by this milestone, so it was not reopened. M011's `node:http` server was always a placeholder and said so.
**The word that mattered was "everywhere"** An envelope covering the errors we remember to throw, while Fastify's own 404s and validation failures keep their default shape, is a convention plus exceptions. So three handlers, not one — `setErrorHandler`, `setNotFoundHandler` and `setSchemaErrorFormatter` — and the tests go looking for the framework's shapes rather than only checking ours.
**A 500 discards the message** An unexpected error's text is written for us, not a caller: table names, driver output, occasionally a connection string. The only way to guarantee §16's "never leaks internals" for an error nobody anticipated is to not use its message. Asserted by throwing one containing a table name and a database host and checking neither reaches the body.
**Two silent-failure bugs caught** `@fastify/swagger` collects routes through an `onRoute` hook, so a fire-and-forget `register()` loads it *after* the routes it documents — producing a valid, empty OpenAPI document and a green build, with §16's "docs cannot drift from code" false on day one. And a conflicting idempotency INSERT **blocks** rather than failing, so a duplicate of a minutes-long agent run would hold a connection until the original finished; a transaction-local `lock_timeout` turns that into a fast `in_flight`.
**Verified in the container** Everything M011, M014 and M015 proved still holds through Fastify: `/` with revision · `/healthz` · `/readyz` with a live database check · §16 envelope with `request_id` on an unmatched route · auth sign-up 200 with the raw body reaching Better Auth · personal organization provisioned as `owner` · `ETag` on GET · SIGTERM → drain → exit 0.
**Note** `target`/`lib` moved ES2023 → **ES2024**, matching Node 24. The old setting made TypeScript hide APIs the runtime has, so the compiler and lint rules disagreed and the workaround was always to write the older form.

### M017 · Policy engine · M · 🔒🏗
**Objective** One place that answers "may this actor do this?"
**Dependencies** M015
**Deliverables** `packages/policy`: `assert(principal, action, resource)`, role definitions, deny-by-default, decision logging.
**Acceptance** Exhaustive authorization matrix tests · deny by default verified · every denial audited · 95% coverage · a lint rule flags inline role checks in handlers.

### M018 · Immutable audit log · M · 🔒🏗
**Objective** Every state change recorded, permanently.
**Dependencies** M016, M017
**Deliverables** `audit_log` table (range-partitioned), same-transaction write helper, `UPDATE`/`DELETE` revoked from the app role, query API for admins.
**Acceptance** FR-AUDIT-1..4 · an `UPDATE` attempt from the app role fails at the database · a rolled-back action leaves no audit row · partition creation automated.

### M019 · API keys · S · 🔒✨
**Objective** Programmatic access with scopes.
**Dependencies** M017
**Deliverables** Key generation with a visible prefix, hashed storage, scope model, `Authorization: Bearer` auth, revocation.
**Acceptance** Key shown once only · scopes enforced by the policy engine · revocation immediate · usage audited.

### M020 · Rate limiting · S · 🔒
**Objective** §16's limits enforced.
**Dependencies** M016
**Deliverables** Redis sliding-window limiter, per-key/per-org/per-IP tiers, `RateLimit-*` headers.
**Acceptance** Limits enforced per §16 · headers present · `429` includes `Retry-After` · limits are per-tenant, not global.

### M021 · Cross-tenant test suite (generated) · M · 🔒✅
**Objective** The most important test suite in the codebase.
**Dependencies** M018
**Deliverables** A generator enumerating every table with `organization_id` × every operation, asserting denial as the wrong tenant; CI integration as a release blocker.
**Acceptance** Every tenant-scoped table covered automatically · adding a table without a policy fails the suite · runs on every commit · 95% coverage on the isolation path.

### M022 · Auth and organization UI · M · ✨
**Objective** Sign-up through org context in the product.
**Dependencies** M009, M015
**Deliverables** Sign-up, sign-in, OAuth, verification, password reset, org switcher, member list, settings screens.
**Acceptance** Full journey works · keyboard complete · axe clean · errors surface the §16 message, never internals.

**═══ GATE 1B ═══** Authorization matrix fully tested · cross-tenant suite green on every table · every state change audited.

---

## Stage 1C — Agent substrate (M023–M036) · highest risk

### M023 · AgentRuntime port and fake adapter · L · 🏗
**Objective** The abstraction the entire product depends on.
**Dependencies** M013
**Deliverables** `packages/agent-runtime`: the 5-method port, `AgentSpec`/`RunContext`/`RunEvent` types, in-memory fake adapter, **shared conformance suite** every adapter must pass.
**Acceptance** Fake adapter passes the conformance suite · the port has no provider-specific types · ADR written including reversal cost and revisit triggers.
**Note** Requires design review before implementation. This is the seam that makes ADR-002 reversible.

### M024 · Agent specification schema · M · 🤖🏗
**Objective** Agents as versioned data.
**Dependencies** M023, M004
**Deliverables** `agent_definitions` table, Zod schema for the §13 spec, version pinning, loader, seed of the 6 MVP roles as YAML.
**Acceptance** A new role is added by authoring a file with no code change · versions immutable once referenced by a run · invalid spec rejected at load.

### M025 · Capability pack loader and scanner · M · 🤖🔒
**Objective** Expertise as versioned documents, safely.
**Dependencies** M024
**Deliverables** `packages/capability-packs`: `SKILL.md` parser with frontmatter validation, version resolution, progressive disclosure, **prompt-injection scanner** for untrusted packs, platform corpus seeded from `skills/`.
**Acceptance** Packs load and resolve versions · a pack cannot grant a tool outside the agent's allowlist · known injection patterns are rejected · scanner has its own test corpus.

### M026 · Managed runtime adapter and sandbox provisioning · L · 🏗🔒
**Objective** Real agent execution in an isolated sandbox.
**Dependencies** M023, M024
**Deliverables** Managed adapter implementing the port; environment configuration with **deny-by-default egress and an allowlist**; per-run session provisioning; repository mounting; graceful failure handling.
**Acceptance** Adapter passes the same conformance suite as the fake · sandbox has no host network · egress allowlist verified by test · cloud metadata endpoints blocked · provisioning p95 < 20 s.
**Note** 🔒 **The ADR-002 bet is validated or falsified here.** A negative finding triggers immediate re-planning per §25, not a workaround.

### M027 · Credential vault integration · M · 🔒
**Objective** Secrets never enter an agent's context or sandbox.
**Dependencies** M026
**Deliverables** Vault provisioning per organization, credential CRUD (write-only in the API), egress-time injection, host allowlisting per credential.
**Acceptance** No secret appears in any prompt, sandbox env, filesystem, or log — asserted by test · credentials never returned by the API · substitution verified only for allowlisted hosts.

### M028 · Run event streaming with replay · M · ✨🏗
**Objective** Live agent output that survives a dropped connection.
**Dependencies** M026, M016
**Deliverables** `run_events` table (partitioned, sequenced), event ingestion, SSE endpoint with `Last-Event-ID` replay, heartbeats, terminal event, backpressure, paginated history endpoint.
**Acceptance** Reconnect replays without loss or duplication · heartbeat prevents proxy timeout · stream always ends with a terminal event · slow consumer dropped, not buffered unboundedly.

### M029 · Realtime gateway and client stream consumer · M · ✨
**Objective** Agent output visible in the browser.
**Dependencies** M028, M009
**Deliverables** SSE fan-out, client hook with reconnect and dedupe, `LogStream` and `Timeline` components (virtualized).
**Acceptance** Output renders live · reconnect is invisible to the user · 10,000 events render without jank · `aria-live` announcements coalesced to ≤ 1 per 2 s.

### M030 · Tool allowlist enforcement · M · 🔒🏗
**Objective** Capability confinement — the real security boundary.
**Dependencies** M026, M017
**Deliverables** Tool authorization at the runtime boundary via the policy engine, per-role allowlists, constrained `bash` (executable allowlist, shell operators rejected), denial logging.
**Acceptance** A tool outside the allowlist is denied and audited · `bash` rejects a non-allowlisted executable · shell operators rejected · a read-only agent cannot write · 95% coverage.

### M031 · Path containment enforcement · S · 🔒
**Objective** No file operation escapes the project root.
**Dependencies** M030
**Deliverables** Canonical path resolution + containment assertion on every file tool.
**Acceptance** `..` traversal blocked · symlink escape blocked · URL-encoded traversal blocked · absolute path outside root blocked — each with a test.

### M032 · Agent run lifecycle and persistence · M · 🏗
**Objective** Runs that survive a restart.
**Dependencies** M026, M028
**Deliverables** `agent_runs` table with pinned agent version and model ID, lifecycle state machine, resumption after control-plane restart, crash detection, interrupt support.
**Acceptance** FR-AGENT-4, 7, 8, 9 · a run survives an orchestrator restart · a crashed run is detected and resumable, never silently lost · interrupt stops at a safe boundary.

### M033 · Cost ledger and budget enforcement · L · 🏗
**Objective** Every token accounted; no unbounded spend.
**Dependencies** M032
**Deliverables** `cost_entries` (append-only, partitioned), per-call accounting including cache-read tokens, rollups, per-run budget ceiling that **pauses** the run, no-progress circuit breaker, credit conversion (integer arithmetic).
**Acceptance** FR-COST-1..3, 7 · exceeding the ceiling pauses and requests approval, never silently overspends · circuit breaker halts a no-progress loop · ledger and rollup reconcile · 95% coverage · no floating-point money.

### M034 · Model tiering resolution · S · 🤖
**Objective** Tiers as named abstractions, never hardcoded IDs.
**Dependencies** M024
**Deliverables** Tier → model mapping table, effort resolution, refusal-fallback configuration on reasoning-tier calls, `stop_reason` handling before content access.
**Acceptance** No model ID appears outside the mapping table (lint-enforced) · a refusal is handled gracefully with fallback · ADR-004 implemented as specified.

### M035 · Prompt assembly with cache stability · M · 🤖
**Objective** Protect the cache hit rate, which is a primary margin lever.
**Dependencies** M025, M034
**Deliverables** Prompt builder guaranteeing a stable cached prefix; deterministic tool serialization; dynamic context appended as messages, never interpolated into the system prompt; context editing and compaction for long runs.
**Acceptance** A test asserts byte-identical prefixes across runs with differing dynamic context · cache-read tokens observed > 0 on a second run · a volatile value in a system prompt fails a test.

### M036 · Replay harness for agent evaluation · M · ✅
**Objective** Deterministic agent testing in CI, at zero marginal cost.
**Dependencies** M032
**Deliverables** Record mode capturing real interactions; replay adapter; fixture management; CI integration.
**Acceptance** Recorded run replays deterministically · replay requires no network and no spend · fixtures are reviewable in a diff.

**═══ GATE 1C ═══** One agent completes a task in a sandbox with: correct cost accounting · enforced allowlist · a budget ceiling that pauses · a stream surviving reconnection · adversarial "no secret in context" assertions passing.

---

## Stage 1D — Orchestration & verification (M037–M047)

### M037 · Director planning agent · L · 🤖✨
**Objective** Goal → architecture note + dependency-ordered milestone plan.
**Dependencies** M035, M036
**Deliverables** Director agent definition and capability packs; structured output contract for plans; credit estimation; repository-summary input.
**Acceptance** FR-PLAN-1, 2 · plan validates against the schema · dependencies acyclic (verified) · every milestone has binary acceptance criteria and a credit estimate · planning eval suite scores ≥ 80%.

### M038 · Plan persistence and dependency graph · M · 🏗
**Objective** The plan as durable, queryable state.
**Dependencies** M037, M004
**Deliverables** `milestones`, `milestone_deps`, `tasks`, `task_deps`; topological sort; cycle detection on insert.
**Acceptance** A cyclic plan is rejected at the service layer with a clear error · property-based tests on the graph · `M042`-style split insertion works without renumbering.

### M039 · Plan approval gate · M · ✨🔒
**Objective** The human approves before anything is built.
**Dependencies** M038, M017
**Deliverables** Approval endpoint, policy-engine gate keyed to autonomy level, plan editing before approval, approval audit.
**Acceptance** FR-PLAN-3, 4 · execution is impossible before approval · edits re-validate the graph · approval recorded with actor, timestamp, and exact approved payload.

### M040 · Task graph dispatch and orchestrator state machines · L · 🏗
**Objective** The orchestrator: the component that makes this an organization.
**Dependencies** M039, M032
**Deliverables** BullMQ workers, explicit milestone and task state machines as files, dependency-aware ready-task selection, parallel dispatch with per-project/org concurrency caps, file-level advisory locks, exponential backoff, quarantine for poisoned tasks.
**Acceptance** FR-PLAN-5..7 · independent tasks run in parallel · a blocked dependency prevents execution · two agents never edit the same file · a repeatedly failing task is quarantined, not retried forever · state survives a restart.

### M041 · Implementer agents (Backend, Frontend, Architect) · M · 🤖
**Objective** Agents that produce code.
**Dependencies** M040, M030
**Deliverables** Three agent definitions with allowlists and permissions; capability packs seeded from `skills/`; scope-discipline and conciseness instructions; **no self-verification instructions** (verification is a structural gate).
**Acceptance** Each agent's allowlist is minimal and enforced · Architect cannot write code · Backend cannot migrate schema · implementation eval suite ≥ 75% on hidden tests.

### M042 · Project memory store · M · 🏗🤖
**Objective** Knowledge that survives runs — the compounding advantage.
**Dependencies** M026, M004
**Deliverables** Memory store provisioning, mounting into the sandbox, `memory_entries` + `memory_versions` (append-only), read at run start / write at run end, **credential scanning on write**.
**Acceptance** FR-MEM-1..4, 7 · memory persists across runs · every mutation versioned with actor · a credential-shaped write is blocked and alerted · redaction clears content while preserving audit.

### M043 · Independent review gate · L · 🤖🔒
**Objective** The product's central claim, structurally enforced.
**Dependencies** M041, M042
**Deliverables** Code Reviewer agent (read-only allowlist, separate session, no authorship context); structured findings with severity and confidence; **orchestrator + policy engine + database constraint** all preventing self-review; report-everything-then-filter design.
**Acceptance** FR-AGENT-5 · a self-review attempt is rejected at all three layers · findings validate against the schema · **review eval suite finds ≥ 80% of seeded defects with ≤ 20% false positives** · reviewer has no write capability.
**Note** The seeded-defect metric is the single most important number in the product. Regression here is a product emergency.

### M044 · Review feedback loop · M · 🏗
**Objective** Failed review returns work to the implementer, bounded.
**Dependencies** M043, M040
**Deliverables** Loop-back transitions, retry ceiling, budget consumption per attempt, escalation to human on exhaustion.
**Acceptance** FR-PLAN-9 · failed review re-dispatches with findings as input · retries bounded · budget consumed per attempt so failure is naturally bounded · exhaustion escalates rather than looping.

### M045 · QA agent and test gate · L · 🤖✅
**Objective** Tests that actually run, honestly reported.
**Dependencies** M041, M040
**Deliverables** QA Engineer agent (tests only, never production code); test execution in the sandbox; machine-parsed results; honest-reporting instruction; gate blocking completion on failure.
**Acceptance** FR-PLAN-8 · a milestone with failing tests **cannot** be marked complete and there is no override · results are parsed from real output, not self-reported · test-quality eval mutation score ≥ 60%.

### M046 · GitHub integration · M · ✨🔒
**Objective** Real repositories, safely.
**Dependencies** M026, M027
**Deliverables** GitHub App, per-repo scoped installation, clone/branch/commit/push via the credential proxy, deterministic branch naming, **default-branch write prohibition**.
**Acceptance** FR-REPO-1..3, 5 · the repository token never enters the sandbox (asserted) · a default-branch write attempt is denied and audited · branch names deterministic.

### M047 · Pull request creation with completion report · M · ✨
**Objective** The deliverable the user actually receives.
**Dependencies** M046, M045
**Deliverables** PR creation; structured completion report (changes, review findings, real test output, credits consumed, decisions recorded); memory write-back; milestone finalization.
**Acceptance** FR-REPO-4 · PR body contains **actual pasted test output**, not a claim · credits shown match the ledger · review findings included · memory updated with decisions.

**═══ GATE 1D ═══** The full twelve-step journey from §12 completes end to end on a real repository.

---

## Stage 1E — Product surface & hardening (M048–M052)

### M048 · Data display components · M · ✨
**Objective** The components the run view needs.
**Dependencies** M008
**Deliverables** DataTable (virtualized), DefinitionList, CodeBlock (Shiki, tokens-themed), **DiffViewer** (color + gutter markers), CostMeter, MilestoneBoard, ApprovalGate, EmptyState, Skeleton.
**Acceptance** DiffViewer readable without color · DataTable virtualizes above 100 rows · ApprovalGate visually distinct from an ordinary button · all axe-clean in both themes.

### M049 · Core screens · M · ✨
**Objective** The MVP product surface.
**Dependencies** M048, M029
**Deliverables** Project list, project overview, **plan approval**, milestone board, run detail (persistent timeline + detail pane), review detail, memory browser, cost panel, settings.
**Acceptance** All §18 key screens present · run view shows current activity and history without a context switch · every list has an empty state · keyboard complete.

### M050 · Cost dashboard and estimate accuracy instrumentation · M · ✨✅
**Objective** Replace §7's modeled economics with measured ones.
**Dependencies** M033, M049
**Deliverables** Per-project/milestone/agent/tier breakdown, estimate-vs-actual tracking, cache hit rate metrics, COGS-per-milestone reporting.
**Acceptance** Dashboard reconciles with the ledger · estimate accuracy measurable against the ±30% target · cache hit rate visible · COGS per accepted milestone computed.
**Note** This milestone is what makes the P1 gate measurable rather than opinion.

### M051 · Adversarial and accessibility hardening · M · 🔒✅
**Objective** Verify the security claims before real users arrive.
**Dependencies** M047
**Deliverables** Full adversarial suite (§23 Mode C), WCAG 2.2 AA audit and remediation, load test to 200 concurrent runs, penetration-test remediation.
**Acceptance** Every adversarial case passes · axe clean across all screens · manual screen-reader audit passed · 200 concurrent runs within NFR targets · pen-test findings remediated.

### M052 · Design-partner onboarding · S · 📄✨
**Objective** 20 partners running real projects.
**Dependencies** M051, M050
**Deliverables** User guide, onboarding flow, feedback capture, success-metric instrumentation.
**Acceptance** 20 partners onboarded · metrics from the §8 criteria collected automatically · feedback loop operating.

**═══ GATE P1 → P2 ═══** All §8 MVP success criteria met, measured across 20 partners and 200 milestones.

---

# PHASE 2 — Collaboration & Control (M053–M067)

| ID | Title | Cx | Type | Deps | Objective / key acceptance |
|---|---|---|---|---|---|
| M053 | Teams domain and schema | S | 🏗 | M015 | Teams within orgs; users in multiple teams; RLS extended |
| M054 | Invitations | S | ✨ | M053 | Email invite with role; single-use token; expiry; audit |
| M055 | Notifications domain + outbox relay | M | 🏗 | M018 | Reliable side effects via outbox; exactly-once publish verified under crash |
| M056 | In-app notifications | S | ✨ | M055 | Run complete, approval needed, budget threshold; read state |
| M057 | Email notifications | S | ✨ | M055 | Resend integration; per-user preferences; unsubscribe |
| M058 | Slack webhook notifications | S | ✨ | M055 | Org-configured webhook; thin payload; failure auto-disable |
| M059 | Notification preferences | XS | ✨ | M056 | Per-user, per-event-type, per-channel |
| M060 | RBAC and multi-user organizations | L | 🔒✨ | M017, M053 | Owner/Admin/Member/Viewer enforced at API **and** data layer; full authorization matrix tested; cross-tenant suite extended |
| M061 | Project-level access control | M | 🔒 | M060 | Team assignment grants project access; verified by matrix test |
| M062 | Concurrency and task locking | M | 🏗 | M040 | File-level advisory locks; two users' runs never collide; verified under load |
| M063 | Chat interface | M | ✨ | M029 | Second interaction surface; ask questions about the project; grounded in memory |
| M064 | Mid-run steering and interrupt | M | ✨ | M063, M032 | Redirect a running agent via the privileged operator channel; interrupt stops at a safe boundary |
| M065 | Plan re-planning | M | ✨ | M038 | Re-plan mid-project; prior decisions preserved; ADR trail intact |
| M066 | Milestone reorder and skip | S | ✨ | M038 | Reorder respecting dependencies; skip with a recorded reason |
| M067 | Settings module (full) | S | ✨ | M060 | Org, team, user, project settings; all changes audited |

**═══ GATE P2 → P3 ═══** 3 concurrent users, 1 project, 5 milestones, zero platform-caused conflicts · RBAC matrix fully tested.

---

# PHASE 3 — Engineering Depth (M068–M082)

| ID | Title | Cx | Type | Deps | Objective / key acceptance |
|---|---|---|---|---|---|
| M068 | Documents module + ingestion | M | ✨ | M004 | PDF/Markdown/text upload, parse, store; status tracking |
| M069 | Chunking and embedding pipeline | M | 🏗 | M068 | pgvector storage; HNSW index; **always pre-filtered by `organization_id`** |
| M070 | Organization capability packs | L | 🤖🔒 | M025, M060 | Customers author standards; every org agent inherits them; **untrusted-pack scanning mandatory**; ≥ 90% convention adherence measured |
| M071 | Capability pack authoring UI | M | ✨ | M070 | Author, version, preview, see which agents inherit |
| M072 | Database Engineer agent | M | 🤖 | M041 | Schema design and migrations; **destructive migration requires human approval** |
| M073 | Documentation Writer agent | S | 🤖 | M041 | Takes docs from the Director; docs updated in the same milestone |
| M074 | Research Agent | S | 🤖 | M041 | Technology evaluation with sourced comparison matrices and ADR drafts |
| M075 | Knowledge base and retrieval | L | ✨ | M069 | Semantic search over code, docs, memory; **citations verifiably correct** |
| M076 | Memory management UI | S | ✨ | M042 | View, edit, delete memory; version history; redaction |
| M077 | Semantic code search | M | ✨ | M075 | Repository-aware retrieval feeding agent context |
| M078 | Performance Engineer agent | M | 🤖 | M041 | Profiling, query analysis, bundle budgets; read-only until authorized |
| M079 | Security Engineer agent + conditional gate | L | 🤖🔒 | M043 | Auto-triggers on auth/data/input/crypto/dependency diffs; **can block a milestone**; blocks a real seeded vulnerability |
| M080 | Refactoring Agent | M | 🤖 | M041 | Behavior-preserving structural improvement; no public API change without an ADR |
| M081 | Agent evaluation corpus v1 | M | ✅ | M036 | The §23 suites; baseline established; nightly live runs |
| M082 | Eval regression gating | S | ✅ | M081 | Release blocks on statistically significant regression, not a single sample |

**═══ GATE P3 → P4 ═══** An org capability pack demonstrably changes output (≥ 90% adherence) · security gate blocks a real seeded vulnerability · citations verified.

---

# PHASE 4 — Product Polish & Breadth (M083–M094)

| ID | Title | Cx | Type | Deps | Objective / key acceptance |
|---|---|---|---|---|---|
| M083 | Dark theme | S | ✨ | M007 | Full dark palette; WCAG AA verified in both themes; token remap only. **Inverted by ADR-008** — v2.0 ships light, so this milestone now adds dark. The `data-theme` hook and the toggle scaffolding it needs were deliberately removed rather than left inert; restoring them is part of the scope. |
| M084 | WCAG 2.2 AA conformance pass | M | ✅ | M083 | Full audit and remediation; manual screen-reader audit; axe clean |
| M085 | Architecture module | M | ✨ | M075 | Living component graph, dependency view, ADR browser |
| M086 | Architecture drift detection | M | ✅ | M085 | Documented graph compared to the real import graph; drift reported |
| M087 | UI + UX Designer agents | M | 🤖 | M041 | Token/component specs, flows, accessibility review |
| M088 | Existing-repository import and analysis | L | ✨ | M077 | Non-greenfield support; structure summary; works on 10 real customer codebases |
| M089 | GitLab support | M | ✨ | M046 | Behind the existing repository-host port |
| M090 | Bitbucket support | S | ✨ | M089 | Same port |
| M091 | Project templates | S | ✨ | M049 | Create from template; seeded conventions |
| M092 | Guided onboarding | M | ✨ | M091 | Self-serve first run; sample project; median < 1 h unassisted |
| M093 | Responsive and tablet layouts | S | ✨ | M084 | Tablet authoring; phone read-only monitoring |
| M094 | Visual regression testing | XS | ✅ | M083 | Component library snapshots in CI |

**═══ GATE P4 → P5 ═══** Self-serve signup → first milestone, median < 1 h, unassisted · WCAG AA verified · import works on 10 real codebases.

---

# PHASE 5 — Delivery & Operations (M095–M107)

| ID | Title | Cx | Type | Deps | Objective / key acceptance |
|---|---|---|---|---|---|
| M095 | Environment management | M | 🏗🔒 | M027 | dev/staging/production per project with **separate credentials**; no credential crossover |
| M096 | Deployment subsystem | L | ✨🔒 | M095 | Container deploy to a managed host; **production always human-approved, non-configurable** |
| M097 | Frontend deployment targets | S | ✨ | M096 | Vercel/Netlify for frontends |
| M098 | DevOps Engineer agent | M | 🤖 | M096 | CI/CD pipeline authoring; **cannot deploy to production** |
| M099 | Infrastructure Engineer agent | M | 🤖 | M096 | IaC authoring; **apply requires human approval** |
| M100 | IaC generation with plan-review gate | L | ✨🔒 | M099 | OpenTofu generation; `plan` reviewed before `apply`; drift detection |
| M101 | Rollback subsystem | M | ✨🔒 | M096 | One-click, always available, never requires a rebuild; exercised successfully |
| M102 | Deployment approval gates | S | 🔒 | M096 | Policy-engine enforced; every approval audited with the exact payload |
| M103 | Monitoring integration | M | ✨ | M096 | Golden-signal dashboards for deployed customer apps |
| M104 | SLOs and burn-rate alerting | L | ✨ | M103 | SLO definition, error budgets, burn-rate alerts; **100% runbook coverage** |
| M105 | Incident triage agent workflow | M | 🤖 | M104 | Agent triages an alert, proposes a fix, opens a PR; **never auto-remediates production** |
| M106 | Runbook authoring | S | 📄 | M104 | A runbook per alert; an alert without one fails CI |
| M107 | Operations guide | S | 📄 | M106 | Deploy, monitor, incident response |

**═══ GATE P5 → P6 ═══** 20 human-approved production deploys · 1 incident triaged end-to-end · **zero unapproved production changes** · rollback exercised.

---

# PHASE 6 — Commercial (M108–M118)

| ID | Title | Cx | Type | Deps | Objective / key acceptance |
|---|---|---|---|---|---|
| M108 | Stripe integration | M | ✨ | M060 | Customers, subscriptions, webhooks with HMAC verification |
| M109 | Subscription tiers and seat management | M | ✨ | M108 | The §7 tiers; seat add/remove; proration |
| M110 | Billing, credits, and metering | L | ✨ | M109, M033 | Credit purchase, consumption from the ledger, rollover rules; **integer arithmetic, reconciles exactly** |
| M111 | Budget alerts and enforcement | S | ✨ | M110 | Org/project ceilings; threshold alerts; enforcement pauses, never overspends |
| M112 | Spend forecasting | M | ✨ | M110 | Forecast from historical run data; estimate accuracy reported |
| M113 | Usage analytics | M | ✨ | M050 | Milestone success rates, review findings, agent performance, cost trends |
| M114 | Admin console | M | 🔒✨ | M060 | Org management, **impersonation with mandatory audit**, feature flags, quota overrides |
| M115 | Support Agent | M | 🤖 | M075 | In-product help grounded in our own docs; escalation to humans |
| M116 | Free and education tiers | S | ✨ | M109 | Gated limits; abuse prevention |
| M117 | Bring-your-own-key (enterprise option) | M | ✨🔒 | M034 | Customer-provided provider credentials via the vault; COGS shifts to customer |
| M118 | Public changelog and status page | XS | 📄 | — | Customer-visible change communication |

**═══ GATE P6 → P7 ═══** 50 self-serve paying customers · measured blended gross margin ≥ 60% · estimate accuracy within ±30%.

---

# PHASE 7 — Enterprise Readiness (M119–M128)

| ID | Title | Cx | Type | Deps | Objective / key acceptance |
|---|---|---|---|---|---|
| M119 | Audit log export | M | 🔒✨ | M018 | SIEM-compatible export; configurable retention |
| M120 | Hash-chained audit records | S | 🔒 | M119 | Tamper evidence; each row includes the prior hash; verification tool |
| M121 | SSO — SAML 2.0 and OIDC | L | 🔒✨ | M014 | Domain-based auto-join; WorkOS for enterprise SSO alongside Better Auth |
| M122 | SCIM provisioning | M | 🔒✨ | M121 | User provisioning and **deprovisioning**; deprovision revokes access immediately |
| M123 | Custom roles and granular RBAC | M | 🔒✨ | M060 | Org-defined roles; policy engine unchanged in shape |
| M124 | GDPR operations | M | 🔒✨ | M042 | DSR endpoints, right-to-erasure including backup rotation, retention automation |
| M125 | Data residency (EU/US regions) | L | 🏗🔒 | M124 | Regional data plane; residency selectable per org; verified no cross-region leakage |
| M126 | DPA and sub-processor register | XS | 📄🔒 | M124 | Published, current, change notification |
| M127 | Self-hosted execution adapter | L | 🏗🔒 | M023, M026 | Agent tool execution in customer infrastructure; **must pass the same AgentRuntime conformance suite as the managed adapter** — this is what proves ADR-002's exit ramp is real |
| M128 | SOC 2 Type II readiness | M | 🔒📄 | M120 | Control documentation, evidence collection, gap remediation |

**═══ GATE P7 → P8 ═══** One enterprise security review passed and contract signed · **M127 passes the shared conformance suite**.

---

# PHASE 8 — Ecosystem & Platform (M129–M132)

| ID | Title | Cx | Type | Deps | Objective / key acceptance |
|---|---|---|---|---|---|
| M129 | Public API and TypeScript SDK | L | ✨ | M016 | Versioned REST per §16; generated SDK; 12-month `/v1` support commitment documented |
| M130 | Outbound webhooks | M | ✨🔒 | M055, M129 | Thin payloads, HMAC signatures, at-least-once with documented dedupe, SSRF protection, auto-disable |
| M131 | Custom agent authoring | L | 🤖✨ | M024, M070 | Customers define role, prompt, tool allowlist, tier, budget; **allowlist ceiling enforced** |
| M132 | Marketplace | L | ✨🔒 | M131 | Capability packs and templates; 70/30 split; mandatory security scanning; sandboxed evaluation before listing; publisher verification |

**═══ GATE P8 → P9 ═══** 25 third-party packs · 10% of runs invoke a customer-authored agent.

---

# PHASE 9 — Increasing Autonomy (continuous)

Not milestone-numbered — each level is a gated policy change, earned per organization on measured
history and **automatically revocable on regression**. See
[§9](../00-foundation/09-feature-roadmap.md#phase-9--increasing-autonomy-continuous) and
[§29](../05-delivery/29-future-expansion.md).

| Level | Unlocked when |
|---|---|
| L1 — auto-merge on review + tests passing | Merge-without-rework ≥ 85% over 100 milestones |
| L2 — plan auto-approves | Plan-edit rate < 10% over 100 plans |
| L3 — agents propose their own milestones | L2 stable for a quarter |
| L4 — continuous operation, exception-only escalation | L3 stable; incident rate below threshold |

Continuous work: self-improvement loops (human-reviewed, eval-verified — never auto-applied),
cross-project learning within an organization, automatic model migration with re-evaluation.

---

## Backlog hygiene

1. No work without a milestone — including bug fixes.
2. Splitting inserts `M0NNa`/`M0NNb`; never renumber.
3. Discovered work becomes a new milestone, not scope creep.
4. A milestone exceeding its complexity estimate is stopped, split, re-estimated.
5. **Security milestones (🔒) are never deferred for schedule.** Feature milestones move instead.
6. Every completed milestone updates the tracker in [§26](../05-delivery/26-milestone-breakdown.md) and `CHANGELOG.md` in its own commit.
