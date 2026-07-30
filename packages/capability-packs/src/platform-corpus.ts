import { fileURLToPath } from "node:url";

/**
 * The platform corpus (ADR-005).
 *
 * `skills/` is the corpus root — not a copy of it. CLAUDE.md already states that
 * those packs "are also the intended packaging format for in-product agent
 * capabilities (see ADR-005)", and copying them into this package would create a
 * second copy of ~1.5 MB of prose that drifts from the first the moment either is
 * edited. One corpus, two consumers.
 *
 * `../../../skills/` resolves to the same place from `src/` and from `dist/`,
 * which is why the path is relative rather than configured.
 */
export const PLATFORM_CORPUS_ROOT = fileURLToPath(new URL("../../../skills/", import.meta.url));

/**
 * Which packs are product content, and why.
 *
 * `skills/` also holds developer tooling and personal workflow packs —
 * `youtube-thumbnail-maker`, `upwork-proposal`, `know-me`. Those are not agent
 * capabilities, and shipping the directory listing as the corpus would hand a
 * Backend Engineer a skill for making video thumbnails.
 *
 * So the corpus is a curated list, and every entry carries a reason. Same
 * discipline as `NON_TENANT_TABLES` in the db package: a list that can silently
 * grow is a list nobody reviews, and the reason is what makes an addition a
 * decision rather than a habit.
 */
export const PLATFORM_PACKS: Readonly<Record<string, string>> = Object.freeze({
  "software-architecture":
    "Component design, boundaries, ADR authoring, tech evaluation. The Architect's core remit (§13 Tier 2).",
  "api-design":
    "REST conventions, versioning, pagination, error envelopes. Shared by Architect, Backend Engineer and Code Reviewer — ADR-005's reusability case.",
  "backend-engineering":
    "Layered services, where business logic lives, framework independence. The Backend Engineer's core remit.",
  "frontend-engineering":
    "React/Next patterns, accessibility, Core Web Vitals, component testing. The Frontend Engineer's core remit.",
  "frontend-design":
    "Visual judgment for UI work, so generated interfaces are not templated defaults. Paired with frontend-engineering.",
  "code-review-standards":
    "Per-language review checks across 13 languages. The Code Reviewer's core remit and §23's review gate.",
  security:
    "OWASP Top 10, auth, injection, secrets. Mandatory gate on auth/data/input changes (§13 Tier 4).",
  scalability:
    "Query and index analysis, caching, async processing, concurrency. Needed wherever a design meets load.",
  observability:
    "SLI/SLO design, golden signals, alerting that does not fatigue. What §11's NFRs require an agent to know.",
  docker:
    "Image layering, caching, compose orchestration, container hardening. Needed by M026 onward.",
  "ci-cd-devops":
    "Pipeline stages, deployment strategies, IaC selection. The DevOps Engineer's remit; deploys stay approval-gated.",
  playwright:
    "E2E test authoring, flaky-test taxonomy, locator discipline. The QA Engineer's remit for browser work.",
  "cost-reducer":
    "Cloud and query cost analysis. §7 makes inference and infrastructure cost a product concern, not an afterthought.",
  "kubernetes-operator-pattern":
    "CRDs and reconcile loops. Narrow, but the self-hosted deployment path (M127) lands here.",
  "skill-security-audit":
    "Injection detection and supply-chain review for third-party packs. §13 names it as the seed of this package's scanner.",
});

/**
 * Platform packs whose content legitimately contains attack strings.
 *
 * `skill-security-audit` documents the patterns it teaches people to find, so the
 * scanner flags it — correctly, by its own definition, since it applies no context
 * downgrade (see `scanner.ts` for why downgrading fenced content is unsound).
 *
 * Recorded as an exemption rather than engineered around, and pinned by a test:
 * any OTHER platform pack producing a critical finding fails the build, which is
 * the property that actually matters. An exemption list with one entry and a
 * reason is honest; a scanner tuned until the corpus passes is not.
 */
export const EXPECTED_CRITICAL_FINDINGS: Readonly<Record<string, string>> = Object.freeze({
  "skill-security-audit":
    "Its subject matter IS injection patterns — it lists them as examples to detect. Trusted platform content, reviewed in Git, never scanned as untrusted input.",
});
