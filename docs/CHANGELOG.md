# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/);
entries are generated from Conventional Commits and then edited for readability.

Every milestone updates this file **in its own commit** ([§22](04-engineering/22-development-standards.md)).

## [Unreleased]

### Added

- **M020 — rate limiting.** §16's tiers as a **sliding** window, in Redis.
  - A fixed window is wrong at the only moment that matters: 100 requests at 11:59:59 and 100 more
    at 12:00:00 is 200 in one second, and the burst is what the limit exists to prevent.
  - The window is a **Lua script, not a pipeline**. A pipeline batches round trips without making
    them atomic. Verified against a real Redis: 50 simultaneous hits counted exactly once each.
  - **Fails open, loudly.** A Redis outage must not become a total outage; the warning is what stops
    that being a silent loss of the control.
  - `RateLimit-*` headers on **every** response, not just the 429 — a client that can see it has 4
    left can slow down; one that only learns at rejection can only retry.
  - Probes are exempt: an orchestrator polls `/readyz` constantly, and limiting it kills the
    container for being healthy.
  - `REDIS_URL` joins the schema; its absence warns in production. This is what M014's
    `secondaryStorage` caveat was waiting for.

### Fixed

- The root tsconfig included `packages/*/vitest.*.config.ts` but no `apps/*` equivalent, so an
  integration config under `apps/` belonged to no project and ESLint reported a **parse error**
  rather than a rule violation.
- The root tsconfig still pinned `lib` to ES2023, overriding M016 — the tooling view disagreed with
  every build.

### Added

- **M019 — API keys.** `atl_…` bearer tokens, scoped per §16, hashed at rest, prefix-visible,
  revocable immediately.
  - **SHA-256, deliberately not Argon2id** — the opposite choice to M014's passwords for the
    opposite reason. A key is 256 bits of CSPRNG output, so there is no dictionary attack to slow
    down, and a slow hash on every authenticated request is a denial-of-service vector.
  - **One answer for every invalid key** (unknown, malformed, revoked, expired). Distinguishing them
    tells an attacker which of their guesses was once real.
  - Verification runs with **no tenant context** — which organization the caller belongs to is what
    the call determines — through a narrow `SECURITY DEFINER` function rather than a widened policy.
  - Lookup is by **hash, never by prefix**: a prefix is public and not unique.

### Fixed

- **M017 conflated policy actions with §16 scopes.** The scopes are coarse and plural
  (`projects:write`); the actions are fine and singular (`project:create`). Compared directly, a key
  scoped `projects:write` would have been refused every write it was created to perform. A scope is
  now a bundle of actions.

### Added

- **M018 — immutable audit log.** FR-AUDIT-1..5, §17 Control 8.
  - **Immutability is a grant, not a convention.** `atelier_app` holds SELECT and INSERT only, so
    `UPDATE audit_log SET …` fails at the database. TRUNCATE is refused separately because RLS does
    not filter it — a role holding it could empty the table for every tenant at once.
  - **Completeness is a type.** `writeAudit` takes a `ScopedTransaction`, which only `withTenant`
    produces, so it cannot open its own transaction and cannot be called after the action committed.
  - Range-partitioned by month from the start, with partition creation automated and idempotent.
  - Query API for org admins, keyset-paginated — this is the table being appended to while you page
    through it.
  - `auditEventForDecision` turns an M017 policy decision into a record, distinguishing an
    `api_key` actor from a `user`.

### Fixed

- The partition function ran as its **caller**, so the application role could not create one.
  `SECURITY DEFINER` with an empty `search_path`, rather than granting the app role CREATE on the
  schema to solve a one-table problem.
- The schema-drift check counted each monthly partition as an undeclared table — it would have
  failed the build on the first of every month.

### Added

- **M017 — policy engine.** `packages/policy` is the single decision point §16 requires: every
  handler calls `policy.assert(principal, action, resource)` and a lint rule now refuses
  `if (user.role === "owner")` anywhere in `apps/**`.
  - **Deny-by-default is structural**, not a trailing `else`: unknown action, unknown role, no
    membership, wrong tenant and un-granted action each return a denial with a reason.
  - **§17 Control 7 is checked before the role matrix**, so the approval gate holds even if the
    matrix is wrong. An approval names the action it approved — §17: "an approval for one action
    never generalizes to the next".
  - API-key scopes **narrow, never widen**: a key is bounded by its scopes *and* its owner's role.
  - `AuthorizationError` carries a fixed message and the reason as a field. A 403 that explains
    itself confirms the resource exists.
  - Every decision, allowed or denied, reaches a `DecisionSink` — the port M018's audit log will
    implement.

### Fixed

- **The approval gate was initially unusable.** Reading §17's "not overridable at any autonomy
  level" as "no role grants these" meant an approval could be presented and the action still refused
  for lack of a role — the control was not stricter, it was broken. Role and approval are now
  independent requirements.

### Added

- **M016 — API conventions.** §16 implemented once, centrally. `apps/api` moves from the
  placeholder `node:http` server to **Fastify** (§14's choice; the NestJS revisit is triggered by
  the P1 gate retrospective, not by this milestone).
  - **One error envelope, everywhere.** Three handlers, because Fastify produces errors on three
    paths with three default shapes — thrown errors, unmatched routes, and schema validation. An
    envelope that covers only the first is a convention with exceptions.
  - A **500 discards the error message** rather than forwarding it. An unexpected error's text
    carries table names and driver output, and the only way to guarantee §16's "never leaks
    internals" for an error nobody anticipated is not to use it.
  - Cursor pagination that **refuses** `limit > 100` rather than clamping — clamping tells a caller
    asking for 5000 that they have the whole list.
  - Idempotency in Postgres, in the same transaction as the work it protects: if the work committed
    and the key did not, a retry in that window does the work twice.
  - `ETag`/`If-Match`, with `If-Match` **required** on a conditional write. Optional-if-absent makes
    the protection opt-in, and the caller who forgets it is the one who overwrites someone's work.
  - OpenAPI generated from the route schemas; probes are hidden from it.

### Fixed

- **`@fastify/swagger` was registered fire-and-forget**, so it loaded *after* the routes it
  documents — a valid, empty OpenAPI document and a green build, with "docs cannot drift from code"
  false from day one.
- **A conflicting idempotency INSERT blocks rather than failing.** A duplicate of a minutes-long
  agent run would have held a connection until the original finished. A transaction-local
  `lock_timeout` turns it into a fast in-flight response.

### Changed

- `target`/`lib` ES2023 → **ES2024**, matching the Node 24 runtime. The old setting hid APIs that
  genuinely exist, so the compiler and the lint rules disagreed about what was available.

### Added

- **M015 — organizations and tenant resolution.** FR-ORG-1..3.
  - A **personal organization on signup**, created atomically with its owner membership. It works
    without a new grant or a policy change by claiming an organization that does not exist yet:
    M004's `WITH CHECK (id = app_current_organization_id())` permits an insert exactly when the row
    being written is the tenant currently claimed.
  - **`resolveTenant`** proves a user may act as an organization by claiming the *requested* one and
    then looking for their membership — RLS filters the lookup, so a row returns only if the
    membership genuinely exists there. Removing that check fails five tests.
  - Slug derivation is deterministic and retries on collision; the unique index is the arbiter
    rather than a pre-flight `SELECT`, which is a race that loses silently under concurrency.

### Fixed

- The unique-violation retry in provisioning was **dead code**: Drizzle wraps driver errors, so the
  Postgres code sits on `.cause` and the top-level check never matched. Only a test that forced a
  collision revealed it — a retry loop nobody exercises is a retry loop that does not work.

### Added

- **M014 — authentication.** Email/password and OAuth sign-in on Better Auth, with Argon2id
  (`m=19456,t=2,p=1`), httpOnly/SameSite=Lax session cookies, server-side revocation, email
  verification, single-use password reset, and rate-limited login. FR-AUTH-1..5 and 9's server half.
  - **[ADR-010](decisions/ADR-010-authentication-identity-boundary.md)** — identity reads through a
    dedicated `atelier_auth` role. `users` under `FORCE ROW LEVEL SECURITY` makes sign-in
    *structurally impossible*: a sign-in request has no tenant context, so the lookup returns zero
    rows and the application reports "no such user" for **every** user in the database. No later
    milestone closes this — tenant resolution is M015 and authentication is M014.
    - `atelier_auth` → identity only, **no grant** on organizations or memberships.
    - `atelier_app` → unchanged from M004, **no grant at all** on `accounts`. A password hash is
      now unreachable from the request-serving role by *privilege*, not by policy — stronger than
      before this milestone, not weaker.
  - **[ADR-011](decisions/ADR-011-transactional-email.md)** — Resend behind an `EmailPort`; §14
    named no provider and FR-AUTH-4/5 both need one.
  - Migration **0003** reconciles Better Auth's required `emailVerified` boolean with our
    audit-bearing `email_verified_at` timestamp — a bidirectional trigger plus a CHECK constraint,
    because a `GENERATED` column is read-only and the library writes the flag.
  - Migration **0004** removes a UNIQUE index 0002 put on `verifications.value`: the token lives in
    `identifier`, and `value` holds the *subject* (a user id for a reset), so a second reset for one
    user collided with the first.

### Changed

- `vitest.config.ts` aliases **every** workspace package to source, not just `@atelier/ui`. Adding
  one export to `@atelier/domain` surfaced the gap as `EmailDeliveryError is not a constructor` — a
  missing build presenting as a missing export.
- Integration scripts run through `turbo`, which builds workspace dependencies first. `packages/auth`
  built itself but not `@atelier/db`, so its tests ran against a stale `dist/`.
- The migration suite no longer hard-codes "there is exactly one migration"; the rollback test walks
  every migration in reverse, since the older a down file is the less anyone has run it.

### Added

- **M011 — staging deploy pipeline** ([ADR-009](decisions/ADR-009-railway-staging.md): Railway, GHCR,
  staging only). Code complete; the deploy itself awaits a Railway project.
  - `apps/api` gained a real HTTP server with `/`, `/healthz`, `/readyz`, correlation ids and
    **graceful SIGTERM shutdown** — verified draining to exit 0 in a container.
  - Multi-stage `Dockerfile`, non-root, multi-arch (amd64 + arm64), provenance and SBOM attested,
    **cosign keyless-signed** so there is no signing key to store or leak.
  - `deploy-staging.yml` runs only after CI is green, deploys **by digest**, and takes a digest input
    for rollback. A tag can be moved; a digest is the image.
  - `scripts/smoke-test.mjs` gates promotion — 8 checks including *"is this the revision we just
    built"*, which is what catches a deploy that silently did nothing.
  - [§26 Staging Runbook](04-engineering/26-staging-runbook.md).
  - `PORT` and `GIT_SHA` added to the env schema.

### Fixed

- **M011 completed 2026-07-29** — the pipeline deploys to staging unassisted, verified 8/8 against
  the live service. Five defects surfaced only once it met real infrastructure, and every one of
  them was invisible on a development machine:
  - the licence gate was **platform-dependent** (Windows binaries acknowledged, Linux ones not);
  - `test:integration` assumed a built `dist/` that only existed locally;
  - **"deploy by digest" was computed and then never used** — a bare `railway redeploy` redeploys
    whatever the service already points at;
  - OCI references must be lowercase and `github.repository` preserves capitalisation, so `cosign`
    could not parse a reference the push had just used successfully;
  - **`ARG GIT_SHA` was never declared**, so Docker discarded the build-arg and `/` served no
    revision — silently disarming the smoke check that exists to catch a deploy doing nothing. It
    had "passed" local verification because `GIT_SHA` was set at run time with `-e`, testing a
    mechanism that was not the one shipping.

- **The licence gate was silently platform-dependent.** `pnpm licenses list` reports only what is
  installed for the current platform, so acknowledging `@img/sharp-win32-x64` by name passed on
  Windows and failed in Linux CI on `@img/sharp-libvips-linux-x64`. Platform binaries of an
  already-reviewed package are now matched by anchored pattern, with a self-test asserting both what
  the patterns must match **and what they must not** — the fuzzy matching is the only place in the
  gate where a quiet widening could waive review invisibly.
- **Integration tests assumed a built `dist/`.** `trace-probe.mjs` imports the compiled output on
  purpose (its whole point is running through Node's real resolution rather than Vite's), but nothing
  guaranteed the build had happened — it passed locally against a stale `dist/` and failed on a clean
  checkout. `test:integration` now builds first.
- **"Deploy by digest" was claimed but not implemented.** The deploy step computed the digest and
  then ran a bare `railway redeploy`, which redeploys whatever the service already points at. The
  workflow now repoints `:staging` at the chosen digest with `docker buildx imagetools create`
  before redeploying, and skips the build entirely on a rollback — rebuilding from `main` would have
  produced a different image than the one being rolled back to.
- **Deploy failed hard when Railway was not configured yet**, which made the setup unperformable:
  Railway needs an image in GHCR before it can be pointed at one, and issues no domain until it has
  deployed. Jobs [10] and [11] now warn and skip instead, so the first run publishes the image.

### Added

- **M013 — Domain package: organizations, users, memberships.** Pure, immutable, zero external
  imports (enforced by dependency-cruiser and the boundaries rule, not by convention). 94 tests, 90%
  floor enforced per-path.
  - **An organization must always keep at least one owner** — the invariant the milestone exists for.
    Enforced over the whole membership set, with `transferOwnership` as the atomic alternative to
    promote-then-demote.
  - `ports/clock.port.ts`: time as branded epoch milliseconds, injected. `Date` is mutable, carries a
    meaningless timezone and compares by reference; §21's lint rules already forbid `Date.now()` here.
  - Email normalisation lowercases and trims but **does not** strip dots or `+tags` — those are
    Gmail conventions, and merging `a.b@` with `ab@` conflates two real accounts. Changing an
    address clears verification.
- `OPENROUTER_API_KEY` and `GROQ_API_KEY` in the env schema. Production requires **at least one**
  provider key rather than a named one, so the schema does not pre-empt an ADR that is still owed.

### Added

- **M010 — Local development environment.** A clean clone reaches a running app in three commands:
  `pnpm install`, `pnpm setup`, `pnpm dev` (~27 s end to end).
  - `docker-compose.yml` with Postgres 17 and Redis, both with healthchecks so `--wait` means
    something. No `container_name`, so two checkouts can run side by side.
  - `pnpm db:up` / `db:down` / `db:reset` / `db:migrate` / `db:migrate down` / `db:seed`, plus
    `setup` chaining them. `setup` provisions `.env` from `.env.example` and never overwrites one.
  - A **synthetic** seed: two organizations, three people. Addresses use `example.test`, which
    RFC 2606 reserves and nobody can register, and a test fails the build if that stops being true.
    Two organizations rather than one, because with a single tenant a broken RLS policy looks
    exactly like correct behaviour when you click around.
  - [§25 Developer Guide](04-engineering/25-developer-guide.md), including the failure modes that
    actually happen.

### Fixed

- **Four bugs that only a clean clone exposes**, found by cloning into a temp directory and running
  the commands rather than trusting a working tree with `node_modules`, `dist` and `.env` already
  in it:
  - `scripts/*.mjs` imported `@atelier/config` and `@atelier/db`, which the **root** `package.json`
    never declared; pnpm's strict isolation refused them.
  - `docker-compose.yml` pinned `container_name`, so a second checkout collided with the first.
  - `DATABASE_URL` is required with no default, so `setup` could not reach the database. The schema
    stays strict; `setup` provisions the `.env` instead.
  - **`pnpm dev` served 500 on every route** — `turbo.json`'s `dev` task had no `dependsOn`, so
    `@atelier/ui` resolved to a `dist/` a fresh checkout does not have. Same class as the bug M003's
    first CI run found.
- `turbo.json` rejects a `//` key inside a task object — it parses JSONC but validates keys
  strictly, so the explanatory field failed the whole file.

### Added

- **M006 — Observability skeleton.** `packages/observability`: OpenTelemetry setup, explicit span
  helpers, a structured JSON logger with redaction, correlation context, and health probes. Both
  apps now bootstrap tracing and logging before anything else.
  - **Redaction is two-layer and not optional.** By key (`password`, `apiKey`, `sessionToken`) and
    by value shape (`sk-ant-…`, GitHub tokens, AWS keys, JWTs, private-key blocks, credentialed
    URLs). It runs in a pino formatter hook *and* on the message string, because the leak that
    actually happens is `logger.error(\`failed to reach ${databaseUrl}\`)`, not a field somebody
    named `password`. A connection string keeps its host and loses its credentials.
  - **Correlation ids ride in `AsyncLocalStorage`**, so they survive `await` and cannot be forgotten
    by a caller. Caller-supplied `x-request-id` values are sanitised — an unvalidated one is log
    injection.
  - `/healthz` checks nothing and `/readyz` checks dependencies, deliberately. Liveness failing
    would have the orchestrator restart every replica and turn a database blip into an outage.
    Readiness failing removes one replica and leaves it running.

### Fixed / learned

- **OpenTelemetry auto-instrumentation produced zero spans, silently.** Two independent causes, both
  found by running it rather than reading about it:
  - `@opentelemetry/instrumentation-pg` instruments the `pg` package; `packages/db` uses `postgres`
    (postgres.js), which has no OTel auto-instrumentation. The dependency was removed.
  - Under pure ESM, `import-in-the-middle` does not reliably patch `node:` core modules, so no HTTP
    span appeared either.
  Explicit helpers (`withSpan`, `withServerSpan`, `withDatabaseSpan`) carry the trace instead and
  work under any module system. Shipping the auto-instrumented version would have delivered a
  telemetry package that traced nothing while reporting success.
- ESLint's script override now supplies `fetch`/`setTimeout` globals and allows `process.exit`,
  which is what a CLI script is for.

### Added

- **M005 — Configuration validation.** The process refuses to boot on invalid configuration.
  - `packages/config` gains a runtime surface: a Zod schema for `NODE_ENV`, `DATABASE_URL`,
    `ANTHROPIC_API_KEY` and `LOG_LEVEL`, plus `loadEnv()` (throws) and `loadEnvOrExit()` (writes
    every problem to stderr and exits **78**, `EX_CONFIG`). Both `apps/api` and `apps/orchestrator`
    call it first.
  - **Every failure is reported at once.** Fail-on-first turns one misconfiguration into one restart
    per variable.
  - **A secret's value never reaches the error message.** §17 treats a secret-shaped string in a log
    as a P1 incident, and a validation error is exactly what gets pasted into a ticket.
    `DATABASE_URL` and `ANTHROPIC_API_KEY` report the problem and never the value — not even a
    length. Non-secrets *do* echo the value, because `(received: "verbose")` is the difference
    between a fix and a guess.
  - `ANTHROPIC_API_KEY` is required only when `NODE_ENV=production`, so a clean checkout can run the
    tests and the dev server without a real key.
  - **`.env.example`** documents every variable, and a test checks it in *both* directions — a
    schema variable missing from the file fails, and so does a documented variable the schema does
    not know. It is also parsed *through the schema*, so it must be a working configuration rather
    than a correct list of names.
  - No dotenv dependency: Node 24 reads `--env-file` natively, leaving `packages/config` with
    exactly one runtime dependency (Zod, §14).

### Added

- **M004 — Postgres, Drizzle, and the first migration, with tenant isolation live from row one.**
  `packages/db` now holds the tenancy and identity core: `organizations`, `users`, `memberships`.
  - **Row-level security with `FORCE`** on all three tables. `FORCE` is the part that matters —
    without it the table owner bypasses every policy, and the application connects as the owner
    often enough that the control would look present and do nothing (ADR-003).
  - **`TenantContext` and a branded `ScopedTransaction`.** A repository cannot be constructed
    without both, and neither can be produced from a bare string, so an unscoped query is a compile
    error rather than a review responsibility (§15 layer 2).
  - **Hand-written SQL migrations** with a runner: `NNNN_verb_noun.{up,down}.sql`, a checksum ledger
    that refuses a migration edited after it was applied, and a `down` for every `up`. drizzle-kit
    generates none of those three things, so Drizzle stays the typed query surface and SQL is the
    source of truth for DDL.
  - **A schema-drift suite** as the price of that split: it introspects the migrated database and
    fails if the SQL and the Drizzle definitions disagree.
  - **CI stage 3 is live** — the integration job now runs the cross-tenant suite against a real
    PostgreSQL 17 via Testcontainers.

### Fixed

- **`packages/domain` could import Node builtins and nothing complained.** The purity rule
  disallows `origin: "external"`, which does not match a `node:`-prefixed specifier — and
  `unicorn/prefer-node-protocol` requires that prefix. So `import { readFile } from "node:fs"` in a
  domain entity sailed straight through the rule enforcing ADR-001's zero-dependency guarantee.
  Found by writing the violation; the rule reported nothing until a `source: "node:*"` policy
  existed. The same blind spot was blocking legitimate builtin imports in `packages/db`.
- ESLint could not parse `packages/*/vitest.*.config.ts` — outside every tsconfig project, so those
  files were silently unlinted.

### Added

- **M003 — CI pipeline.** `.github/workflows/ci.yml` implements §24 stages 1, 2 and 4 as three
  parallel jobs, with a composite setup action so the Node and pnpm pins live in one place.
  - **Static analysis**: Prettier, ESLint, dependency-cruiser, **knip** (dead code), the WCAG
    contrast gate, **a dependency licence gate**, and **gitleaks** secret scanning.
  - **Unit + coverage**: Vitest with §23's floors *enforced* (80% lines/statements/branches/
    functions) rather than reported.
  - **Build**: typecheck, Turborepo build, Storybook build, and a check that Storybook actually
    compiled its Tailwind utilities.
  - Caching: pnpm store via `setup-node`, Turborepo via `actions/cache`. The remote cache is wired
    behind `TURBO_TOKEN`/`TURBO_TEAM` and falls back cleanly when they are absent.
  - **Stage 3 (integration) is deliberately absent** until M004 gives it a database. §24 now carries
    a stage-status table saying which stages are live and which are waiting.
- `scripts/check-licenses.mjs` — fail-closed licence gate. Permissive licences pass; anything else
  must be individually acknowledged in the script *with a written reason*. Five packages are, all
  weak-copyleft or attribution in build/test tooling.
- `scripts/check-storybook-css.mjs` — asserts the Storybook bundle contains compiled utilities.
- `.nvmrc`, `.gitleaks.toml`, and a root `postcss.config.mjs`.
- Vitest resolves `@atelier/*` to **source** rather than to built `dist`. Tests now exercise the
  code we wrote, do not depend on build ordering, and coverage instruments the right files —
  which took measured coverage from **85.5% to 98.55%** without a single new test. `dialog.tsx`
  had always been covered; the copy being measured was not the copy being run.

### Fixed

- **Storybook had rendered every component unstyled since M008.** No PostCSS config existed at the
  repo root, so Vite inlined Tailwind's source stylesheets rather than running the engine: the
  bundle contained `@layer utilities` and not one utility inside it. `pnpm build:storybook` exited 0
  the entire time. Found because knip asked why the root declared `@tailwindcss/postcss` without
  using it.
- **ESLint was linting `storybook-static/`** — minified vendor bundles, under type-aware rules. The
  directory is absent from a clean checkout, so the gap only appeared once CI started building
  Storybook. **Lint dropped from 110 s to 9.9 s.**
- **`@atelier/config` was a decorative dependency in 12 packages.** Every `tsconfig.json` extended it
  by relative path, so the declared edge did nothing. Now extended by package name, which is also
  what makes the declaration true. `tailwindcss` moved to `packages/ui`, the package whose
  `theme.css` imports it, and was dropped from `apps/web` and the root.
- Root `@testing-library/user-event` removed — both consumers declare their own.
- **The pipeline's own first run failed, and the failure was real.** On a clean checkout there is no
  `dist/`, so `@atelier/ui` resolved to nothing: ESLint's type-aware rules fired `no-unsafe-*` on
  correct code and two test files failed to import (43 of 64 tests collected). Every command had
  passed locally because a stale `dist/` was sitting on disk. Fixed by aliasing vitest to source and
  building the packages before the lint step — and reproduced locally first by deleting `dist/` and
  the turbo cache, which is now the only honest way to verify this pipeline.
- All GitHub Action pins moved to their Node 24 runtimes (`checkout@v7`, `setup-node@v7`,
  `upload-artifact@v7`, `cache@v6`, `pnpm/action-setup@v6`, `gitleaks-action@v3`). The v4/v2
  generation runs on Node 20, which GitHub removes from hosted runners in September 2026.

### Changed — BREAKING (visual)

- **Design System v2.0 — the entire visual identity is replaced.** Owner directive; see
  [ADR-008](decisions/ADR-008-design-system-v2.md) and the rewritten
  [§18](03-design/18-design-system.md).
  - **Warm neutral, light.** Page `#f7f5f1`, sidebar `#ece8e2`, white cards. **Orange is the primary
    accent, blue the secondary.** v1.0's dark near-black and deep teal are gone.
  - **Typography**: Manrope (display) + Inter (UI) + JetBrains Mono, self-hosted via `next/font`.
    Scale moves from a dense 13px UI to 14px UI / 16px body, with a 13–64px range.
  - **Geometry**: 48px controls, 10–28px radii, an 8px grid with 20px removed, shadows that almost
    disappear.
  - **Sidebar** active state is a blue left bar over a soft blue field. **Top navigation** is now
    workspace switcher, search, notifications and account menu — the breadcrumb was removed as
    clutter, per the directive.
  - New `Card` and `StatCard` primitives; `PageHeader` in the app.
  - **Not one component changed which token it reads.** The two-layer token architecture from M007
    is what made a total re-skin a one-file change.

- **Dark mode removed; light is the product.** The directive specifies one palette and names "too
  dark" among the things to avoid. `toggleTheme`, `resolveInitialTheme`, `THEME_STORAGE_KEY`, the
  pre-paint `THEME_INIT_SCRIPT`, the topbar toggle and the Storybook theme control were **deleted**
  rather than left inert. The `data-theme` hook survives, so M083 (re-scoped from "light theme" to
  "dark theme") adds a palette by writing one CSS block.

### Fixed

- **Four defects found by the owner running `turbo run dev`.** All of them were invisible to the
  production-build verification done at the time, which is the lesson: `next start` and `next dev`
  are different products, and route-level errors surface in dev.
  - **`/projects` threw on render.** `<Link href={{ pathname: "/projects/[projectId]", query }}>`
    is rejected outright by the App Router — it throws rather than warns, so the page went to the
    error boundary and clicking a project card was impossible. Now a template literal.
  - **Hydration mismatch on `<body>`.** Browser extensions (the report came from Bitdefender
    TrafficLight) inject attributes before React hydrates. `suppressHydrationWarning` was on
    `<html>` before v2.0 and was dropped in the rewrite; it is now on `<body>`, where the mutation
    actually happens, and is one level deep so a real mismatch still fails loudly.
  - **The search field did nothing.** It was a button styled as an input, which is only honest if
    it opens something. It is now a real command palette — `/` or Ctrl/Cmd+K, filter-as-you-type,
    arrow keys, Enter, Escape, `aria-activedescendant` — built on a new `Dialog` primitive.
  - **No focus ring anywhere, and the whole cascade was upside down.** `tokens.css` declared its
    base rules *unlayered*, and unlayered CSS outranks every `@layer`, so the global
    `:focus-visible` silently beat any component that tried to style its own focus. Moving it into
    `@layer base` fixed the precedence and immediately exposed the second half: every component
    paired `outline-none` with `focus-visible:outline-2`, and Tailwind's `outline-2` sets
    outline-*width*, never outline-*style* — so with the global crutch gone, nothing rendered.
    `tokens.css` now owns the ring; the redundant per-component declarations are deleted.

- **The specified palette failed WCAG 2.2 AA in 20 of 23 load-bearing pairs**, measured before
  implementation. Every specified colour is kept and used where the requirement is 3:1 or already
  met; minimally darkened counterparts — same hue and saturation — carry the roles involving text.
  Most visibly: the **primary button fills `#c8510e` (4.53:1) rather than the brand `#f06d22`
  (3.04:1)**. Reversing that is one token and costs AA on every primary action.
  - The vivid `#f06d22` remains the brand orange in the logo mark, gradients and chart series 1.
  - The logo mark's letter sits at 3.04:1 under WCAG 1.4.3's logotype exemption, marked
    `data-logotype` in the DOM so the exemption is visible rather than assumed.
  - Decorative borders keep the directive's soft `#dad6cf`/`#e5e2dc` — 1.4.11 governs control
    boundaries, not decoration.
- **`font-[var(--font-display)]` and `font-[var(--weight-bold)]` were silently overriding each
  other.** Tailwind's `font-` prefix covers both family and weight, and arbitrary values are
  ambiguous. Now canonical `font-display` / `font-bold`.

### Added

- Contrast gate expanded from 40 pairs across two themes to **59 pairs** covering every surface a
  token can land on. The sidebar is darker than the page and is where borderline values fail first;
  it caught two that survived the first pass.
- Three architectural claims that were prose are now tests: **no component references a primitive
  token**, the directive's palette cannot drift, and `THEME_BASE_COLOR` cannot desync.
- Two more after the dev-mode bug report: **no component may pair `outline-none` with a
  `focus-visible` outline**, and the base focus rule must stay inside a cascade layer components can
  override. Both fail when reintroduced.
- `Dialog` primitive (Radix), and `CommandPalette` in the app with 10 tests. 64 tests total.

- **M009 — AppShell and routing.** `apps/web` is a running Next.js 16 application.
  - App Router with a `(dashboard)` route group, `/projects`, `/projects/[projectId]`, `/agents`
    and `/settings`.
  - **AppShell**: collapsible sidebar (248px ↔ 56px) whose state persists across reloads, topbar
    with breadcrumb and a theme toggle. Collapsed nav links keep their accessible names.
  - `error.tsx`, `loading.tsx` and `not-found.tsx` boundaries. The error boundary shows a digest
    reference and never the raw message (§16).
  - Flash-free theming via `THEME_INIT_SCRIPT` in `<head>`.
  - **`pnpm dev` now serves the dashboard at `localhost:3000`.**

### Fixed

- **Dark-first was not actually dark-first.** `resolveInitialTheme` consulted the OS
  `prefers-color-scheme` ahead of the default, so a light-mode operating system silently overrode
  §18's dark-first direction and §8's "dark mode only in MVP". Found by looking at the running app,
  not by any test. Now dark unless the user has explicitly chosen; revisit at M083.
- The `boundaries/element-types` and `boundaries/external` overrides in the test config had been
  dead since M002 renamed the rule to `boundaries/dependencies` — the exemption silently did nothing.

### Changed

- `THEME_BASE_COLOR` exported from `@atelier/ui`. `<meta name="theme-color">` is read before any
  stylesheet, so it cannot use a CSS variable; a test asserts the two literals stay equal to
  `--bg-base` in `tokens.css`.
- `unicorn/prefer-iterator-to-array` disabled — it suggests ES2025 iterator helpers that our ES2023
  `lib` cannot type. Revisit when the shared target moves.
- `unicorn/filename-case` disabled under `apps/web/src/app` — Next owns that naming contract
  (`[param]`, `(group)`), and renaming would break routing.

- **M008 — UI primitives.** The base component set from [§18](03-design/18-design-system.md):
  Button, Input, Textarea, Select, Checkbox, Switch, Badge, Icon, Avatar, Tooltip and
  StatusIndicator, plus a `Field` wrapper and the `cn` class-merge utility.
  - Radix primitives supply behaviour (focus management, ARIA, keyboard, typeahead); **all styling is
    ours**, drawn from semantic tokens only, so the visual language stays original.
  - `Field` centralises label/description/error wiring, so no control can ship without an associated
    visible label — §18 forbids placeholder-as-label.
  - `StatusIndicator` renders every run state as **icon + text + colour**, never colour alone
    (NFR-A11Y-5).
  - **Storybook** gallery at `pnpm storybook` (`localhost:6006`) with a live dark/light toolbar — a
    running, interactive UI one milestone earlier than planned.
  - **Vitest + Testing Library + axe-core** harness with a `toHaveNoA11yViolations` matcher. 42 tests.

### Changed

- `packages/ui` splits `tsconfig.json` (editor and lint, includes tests) from `tsconfig.build.json`
  (emit, excludes tests and stories) — type-aware linting needs tests in a project, the build does not.
- `unicorn/name-replacements` disabled: it renames `Props` → `Properties`, but `Props` *is* the React
  vocabulary and §21 requires matching domain terms.
- `not-to-dev-dep` (dependency-cruiser) now exempts `.d.ts` and `.stories.tsx` — neither is shipped code.

- **M007 — Design tokens.** The [§18](03-design/18-design-system.md) token system is live: 116 tokens
  across colour, typography, spacing, radius, layout, z-index, motion and shadow, in two layers
  (primitives → semantic) so theming remaps semantics rather than editing components.
  - `packages/ui/src/tokens/tokens.css` — primitives + semantic layers, dark and light.
  - `packages/ui/src/tokens/theme.css` — Tailwind v4 `@theme` bridge. Utilities resolve to semantic
    tokens (`bg-surface` → `var(--bg-surface)`); **primitives generate no utility at all**, so there
    is no accidental path around the design system.
  - `packages/ui/src/tokens/theme.ts` — `data-theme` switching, OS-preference resolution, and a
    flash-free init script. Dependency-free and framework-agnostic.
  - `scripts/check-contrast.mjs` — WCAG 2.2 AA verification wired into `pnpm verify`. 40 pairs, both
    themes.
  - Lint rule rejecting hardcoded colours (`#hex`, `rgb()`, `hsl()`) and direct primitive references
    in `packages/ui` and `apps/web`.

### Fixed

- **Four genuine WCAG 1.4.11 contrast failures in §18's own specified token values**, found the first
  time the contrast checker ran: `--border-default` was 2.60:1 (dark) and 2.56:1 (light) against a
  3:1 requirement for control boundaries. §18's hand-written "4.6:1 / 4.7:1" claims for
  `--text-tertiary` were also wrong (actual: 7.41 and 6.39). Tokens corrected, §18 amended with
  machine-verified figures, and the correction recorded in place rather than quietly patched.
- `packages/ui` had no DOM types (`lib` was ES2023-only), so browser APIs were untyped.
- `no-param-reassign` was flagging the document mutation that is `setTheme`'s entire purpose; scoped
  with `ignorePropertyModificationsFor`.

### Changed

- **Sequence deviation, owner-approved:** M007 → M008 → M009 pulled ahead of M003–M006 to reach a
  runnable UI sooner. A reordering, not a scope change — [§25](05-delivery/25-roadmap.md) already
  designates UI work as parallelizable. CI (M003) is deferred by three milestones; local hooks and
  `pnpm verify` continue to gate every commit. Recorded in [BACKLOG.md](backlog/BACKLOG.md).

- **M002 — Shared config and enforced boundaries.** The coding standards are now machine-enforced
  rather than reviewer-remembered.
  - `packages/config/tsconfig.base.json` hardened with the full [§21](04-engineering/21-coding-standards.md)
    set: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
    `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
  - `eslint.config.js` — type-aware typescript-eslint plus `eslint-plugin-boundaries` encoding
    §19's layer table (folder elements *and* within-app file roles), unicorn, import-x, and jsx-a11y
    (armed for M008).
  - The `any` gate implemented literally as §21 states it: `no-explicit-any` is an error and the only
    escape is a disable comment carrying `-- justified: <reason>`, enforced by
    `eslint-comments/require-description`.
  - `.dependency-cruiser.cjs` — `no-circular` as an **error** (NFR-MAINT-4) plus a domain-purity rule.
  - Prettier, commitlint (§22's exact type list), husky `pre-commit` + `commit-msg`, lint-staged.
  - Root `tsconfig.json` — a workspace-spanning, emit-free view for tooling only.
  - New scripts: `lint`, `lint:fix`, `format`, `format:check`, `depcruise`, and `verify`.

### Fixed

- Three latent misconfigurations in the boundary tooling, each of which would have left a guardrail
  silently inert. Found only because M002 was verified adversarially — a clean lint run proved nothing:
  - `boundaries` resolves through the legacy `import/resolver` setting, not `import-x/resolver-next`;
    without it every cross-package import was classified "unknown" and skipped.
  - `checkAllOrigins` defaults to `false`, so external (npm) imports were never evaluated and the
    domain-purity rule could not fire.
  - Policy precedence is **last match wins**, not first — the broad "allow external" policy was
    shadowing every narrow disallow beneath it.
  - `dependency-cruiser` resolved workspace packages to `dist/`, which its own `exclude` dropped, so
    cross-package dependencies were absent from the graph entirely. Fixed with source `paths` in the
    root tsconfig.
- `boundaries/no-unknown-dependencies` is now an error, so an unclassifiable import fails loudly
  instead of silently bypassing the policy engine.

- **M001 — Monorepo and tooling.** pnpm workspaces + Turborepo with the full [§19](04-engineering/19-folder-structure.md)
  package skeleton: 3 apps (`web`, `api`, `orchestrator`) and 10 packages (`config`, `contracts`,
  `domain`, `db`, `agent-runtime`, `policy`, `cost`, `capability-packs`, `observability`, `ui`).
  Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.nvmrc`.
  `packages/config` provides a baseline `tsconfig.base.json` that every package extends.

### Changed

- **Node pinned to 24 LTS**, not the 22 named in the blueprint — `ASSUMPTION-008` resolved at M001.
  pnpm `11.17.0`, Turborepo `2.10.7`, TypeScript `5.9.3` pinned alongside it.
  [§14](02-architecture/14-technology-stack.md) updated; ADR-001 intentionally left unedited because
  ADRs are immutable and the Node line was incidental to its decision.
  See [ASSUMPTIONS.md §008](decisions/ASSUMPTIONS.md).

### Notes

- `apps/api` and `apps/orchestrator` depend on `@atelier/domain` via `workspace:*` — present
  specifically so the "workspace protocol resolves internal deps" criterion is verified by a real
  build and a runtime execution rather than asserted.
- Framework scaffolding is deliberately absent: Next.js arrives at M009, Fastify at M016. M001 is the
  skeleton only.
- TypeScript 7.x is available but deferred — majors are a deliberate milestone per
  [§22](04-engineering/22-development-standards.md).

---

## [0.0.0] — 2026-07-27 — Blueprint

Phase 0 complete. Architecture and planning documentation established. No application code.

### Added

**Governing specification**
- `CLAUDE.md` — permanent operating contract, milestone workflow, approval gates, project-memory map

**Product foundation (§1–9)**
- Product vision, mission, and problem statement
- Market analysis, competitor analysis, and target-audience segmentation
- Revenue model with modeled unit economics
- MVP definition — narrowed to 7 modules and 6 agents
- Nine-phase feature roadmap placing all 23 modules and 19 agents

**Requirements (§10–11)**
- Functional requirements across 10 modules with priorities and verification
- Non-functional requirements with measurable targets and verification methods, including an explicit
  conflict-resolution table

**Architecture (§12–17)**
- Control-plane / execution-plane system architecture
- Agent architecture: 19 roles, capability packs, orchestration, context strategy, memory tiers,
  verification gates, and guardrails against known agent failure modes
- Technology stack with nine-criteria evaluation per decision
- Database strategy with three-layer tenant isolation and expand/contract migration policy
- REST API strategy with streaming, idempotency, and versioning
- Security strategy with threat model, nine controls, and explicitly accepted risks

**Design (§18)**
- Original design system: two-layer token architecture, both themes contrast-verified, component
  library specification, motion budget, and binding accessibility requirements

**Engineering standards (§19–24)**
- Folder structure with enforced layer boundaries
- Documentation structure and immutable-ADR policy
- Coding standards with automated enforcement mapping
- Development standards: milestone lifecycle, Definition of Done, agent-collaboration rules
- Five-layer testing strategy including a first-class agent-evaluation layer
- CI/CD strategy with human-gated production promotion

**Delivery (§25–30)**
- Roadmap with critical path and re-planning triggers
- Milestone system: conventions, complexity model, progress tracker
- Risk register: 17 risks scored, with owned mitigations and accepted residuals
- Technical debt prevention with 12 pre-recorded deliberate debts and their triggers
- Future expansion strategy, including expansions explicitly rejected
- Master development plan with measured phase gates

**Backlog**
- 132 dependency-ordered milestones with objectives, complexity, deliverables, and acceptance criteria

**Decisions**
- ADR-001 — TypeScript monorepo with pnpm + Turborepo
- ADR-002 — Claude Managed Agents as the execution plane, behind an `AgentRuntime` port
- ADR-003 — PostgreSQL + pgvector as the single primary datastore
- ADR-004 — Model tiering by task class, resolved at runtime
- ADR-005 — `SKILL.md` as the agent capability-pack format
- ADR-006 — Modular monolith with enforced boundaries
- ADR-007 — Verification gates enforced structurally, not by prompt
- Decision log, ADR template, and a 10-entry assumptions register

### Notes

- **Scope pushback recorded.** The governing specification's 23 modules and 19 agents represent a
  multi-year program. The MVP was narrowed to 7 modules and 6 agents, with everything else sequenced
  across nine phases rather than dropped. See [§8](00-foundation/08-mvp-definition.md).
- **Assumptions are marked, not hidden.** Ten `ASSUMPTION-nnn` markers are registered in
  [ASSUMPTIONS.md](decisions/ASSUMPTIONS.md) with impact and resolution paths. Market sizing and unit
  economics are reasoned models, not research, and are flagged as such wherever they appear.
- The 34 capability packs in [`skills/`](../skills/) are designated the seed corpus for the platform's
  agent capability library (ADR-005).

[Unreleased]: https://github.com/El-Masterio/AI-Engineering-Platform/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/El-Masterio/AI-Engineering-Platform/releases/tag/v0.0.0
