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

`pnpm setup` is `db:up && db:migrate && db:seed`. It is idempotent: run it again after pulling
and it applies whatever is new.

You do **not** need a `.env` to start. Every variable that has a sensible local default has one, and
`.env.example` documents the rest. Copy it if you want to change something:

```bash
cp .env.example .env
```

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
