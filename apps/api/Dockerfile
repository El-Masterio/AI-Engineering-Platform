# syntax=docker/dockerfile:1.7
#
# API service image.
#
# Multi-stage so the runtime layer carries no compiler, no source and no dev
# dependencies — smaller to pull on every deploy, and a smaller attack surface
# for anything that gets a shell.
#
# ADR-009: this image is the unit of deployment and is deliberately portable.
# Nothing here is Railway-specific; the same image runs on Kubernetes with the
# same environment variables and the same probes.

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable

# Manifests only, so this layer caches until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/orchestrator/package.json apps/orchestrator/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY packages/agent-runtime/package.json packages/agent-runtime/
COPY packages/policy/package.json packages/policy/
COPY packages/cost/package.json packages/cost/
COPY packages/capability-packs/package.json packages/capability-packs/
COPY packages/observability/package.json packages/observability/
COPY packages/ui/package.json packages/ui/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm turbo run build --filter=@atelier/api...

# Prune dev dependencies in place. `pnpm deploy` would give a smaller tree, but
# it does not inline workspace packages under the default linker and the two
# attempts to make it produced an image that could not resolve @atelier/config.
# A working 300MB image beats a broken 60MB one; revisit if pull time matters.
RUN pnpm prune --prod || true

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# The commit this image was built from, surfaced on `/` so a running deploy can
# be identified without guessing.
#
# An ARG must be redeclared in the stage that uses it — the workflow passed
# --build-arg GIT_SHA from the start and Docker silently discarded it, because
# no stage declared it. `/` then reported no revision, which quietly disarmed
# the one smoke check that catches a deploy doing nothing. Local verification
# missed it by passing GIT_SHA at RUN time with -e, testing the mechanism that
# was not the one being shipped.
ARG GIT_SHA=""
ENV GIT_SHA=${GIT_SHA}

# Non-root. `node` already exists in the base image with uid 1000.
USER node

COPY --from=build --chown=node:node /app ./

# Documentation only — Railway injects PORT and the app reads it.
EXPOSE 3001

# No shell form: with it, PID 1 becomes /bin/sh, which does not forward SIGTERM,
# and every deploy would SIGKILL the process instead of draining it.
CMD ["node", "apps/api/dist/main.js"]
