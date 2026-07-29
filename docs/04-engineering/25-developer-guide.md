# 25. Developer Guide

Getting a clean clone to a running application, and what to do when it misbehaves.

M012 expands this into the full guide. What is here is what M010 delivers and verifies: the
three-command path, the commands that support it, and the failure modes that actually happen.

## Prerequisites

| | |
|---|---|
| **Node 24 LTS** | `.nvmrc` pins it. `pnpm install` refuses another major via `engines`. |
| **pnpm 11+** | Pinned by `packageManager`. `npm install -g pnpm@latest` — on Windows `corepack enable pnpm` needs an administrator shell. |
| **Docker** | For Postgres and Redis, and for the integration suite (Testcontainers). Docker Desktop's daemon must be *running*, not merely installed. |

## Three commands

```bash
pnpm install
pnpm setup      # docker compose up --wait, migrate, seed
pnpm dev        # dashboard -> http://localhost:3000
```

`pnpm setup` is `ensure-env && db:up && db:migrate && db:seed`. It is idempotent: run it again after pulling
and it applies whatever is new.

`pnpm setup` creates `.env` from `.env.example` on first run and never overwrites an existing one.

It does that rather than the schema defaulting `DATABASE_URL`, and the distinction matters: a
required variable that silently falls back to localhost is how a production process ends up happily
connected to nothing. The schema stays strict; the local path provisions the file.

Node 24 reads env files natively, so there is no dotenv dependency:

```bash
node --env-file=.env <entrypoint>
```

## Commands

### Database

| Command | What it does |
|---|---|
| `pnpm db:up` | Starts Postgres and Redis, waiting for both healthchecks |
| `pnpm db:down` | Stops them. **Keeps** the data volume |
| `pnpm db:reset` | Destroys the volume, then up + migrate + seed. The "start again" button |
| `pnpm db:migrate` | Applies pending migrations |
| `pnpm db:migrate down` | Reverses exactly one migration |
| `pnpm db:seed` | Inserts the synthetic seed. Idempotent, and never overwrites local edits |

### Verification

| Command | What it does |
|---|---|
| `pnpm verify` | Every fast gate, in the order CI runs them |
| `pnpm test` | Unit tests (jsdom + node) |
| `pnpm test:integration` | Integration tests. **Needs Docker** — starts real Postgres containers |
| `pnpm test:coverage` | Unit tests with §23's floors enforced |

Individual gates: `lint` · `depcruise` · `knip` · `check:contrast` · `check:licenses` ·
`typecheck` · `build`.

### Running things

| Command | What it does |
|---|---|
| `pnpm dev` | The dashboard at [localhost:3000](http://localhost:3000) |
| `pnpm storybook` | The component gallery at [localhost:6006](http://localhost:6006) |

## The seed

Two organizations, three people, three memberships — fixed ids, so a URL you bookmarked still works
after `pnpm db:reset`.

| | |
|---|---|
| **Northwind Traders** (`northwind`) | Ada Lovelace (owner), Grace Hopper (member) |
| **Initech** (`initech`) | Alan Turing (owner) |

Two organizations rather than one **on purpose**: with a single tenant seeded, a broken RLS policy
looks exactly like correct behaviour when you click around.

Seed data is synthetic and stays that way. Addresses use `example.test`, which RFC 2606 reserves
and nobody can register, and `packages/db/src/seed.test.ts` fails the build if that stops being
true. Do not paste production rows in here to reproduce a bug — write a test.

## When it misbehaves

| Symptom | Cause |
|---|---|
| `pnpm setup` hangs or `Could not find a working container runtime strategy` | Docker's daemon is not running. Installing Docker Desktop is not the same as starting it — and updating it stops the daemon. |
| `Invalid environment — 1 problem: DATABASE_URL …`, exit 78 | The process refuses to boot on bad configuration (§M005). The message lists every problem; secrets are never echoed. |
| Port 5432 or 6379 already in use | Another Postgres or Redis is running. Stop it, or change the published port in `docker-compose.yml`. |
| Migrations report *"modified after it was applied"* | An already-applied migration was edited. Migrations are forward-only (§15) — write a new one. |
| Integration tests pass locally and fail in CI | Almost always a stale `dist/`. CI checks out clean. Reproduce with `pnpm clean && rm -rf .turbo`. |
| Storybook renders unstyled | The root `postcss.config.mjs` is missing, so Tailwind never runs. `pnpm check:storybook-css` catches it. |

## Related

- [§24 CI/CD Strategy](24-cicd-strategy.md) — the same gates, running on every push
- [§15 Database Strategy](../02-architecture/15-database-strategy.md) — migration policy and tenancy
- [§23 Testing Strategy](23-testing-strategy.md) — what each layer is for
- `.env.example` — every variable the system reads

## Authentication locally (M014)

Two database roles, not one. `atelier_app` serves requests and cannot read a password hash;
`atelier_auth` reads identity and cannot touch tenant data ([ADR-010](../decisions/ADR-010-authentication-identity-boundary.md)).
`pnpm setup` provisions both; if you are wiring an environment by hand, `AUTH_DATABASE_URL` must be
the **auth** role's credentials. Pointing it at `DATABASE_URL` works perfectly and silently deletes
the boundary — every route responds, every test passes, and the request-serving role holds
credentials.

### Getting a verification or reset link

With no `RESEND_API_KEY` set, mail is logged instead of sent — and **the logged link is not
clickable**. §M006's redaction rewrites secret-shaped strings, so the token comes out as
`token=199[REDACTED]@`. That is the redaction layer working as specified (§17 treats a
secret-shaped string in a log as a P1 incident), not a bug to route around.

Read the token from the database instead:

```bash
psql "$AUTH_DATABASE_URL" -c \
  "SELECT identifier, value, expires_at FROM verifications
   WHERE consumed_at IS NULL ORDER BY created_at DESC LIMIT 1"
```

For **email verification** the token is the `identifier`; visit
`{AUTH_BASE_URL}/api/auth/verify-email?token=<identifier>`.

For a **password reset** the token is also the `identifier` (`value` holds the user id — see
migration 0004), and the link shape is `/api/auth/reset-password/<token>`.

Or set a real `RESEND_API_KEY` and receive the mail properly.

### OAuth

Both halves of a provider are required together; the env schema refuses half a pair, because half a
provider boots cleanly, renders the button, and fails at the redirect with the user already
committed. Register these callback URLs:

```
{AUTH_BASE_URL}/api/auth/callback/github
{AUTH_BASE_URL}/api/auth/callback/google
```
