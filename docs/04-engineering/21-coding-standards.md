# 21. Coding Standards

> Detailed per-language review criteria live in the `code-review-standards` capability pack in
> [`skills/`](../../skills/code-review-standards/). This section states the project-wide rules that
> the pack does not cover, and the ones we enforce automatically.

## Philosophy

**Write code that reads like the surrounding code.** Match the comment density, naming, and idioms of
the file you're in. Consistency across a codebase is worth more than any individual improvement.

**Prefer deleting to abstracting.** Two similar call sites are a coincidence. Three are a pattern.
Premature abstraction is more expensive than duplication because it constrains the shape of every
future change.

**Make the illegal state unrepresentable.** Prefer a type that cannot hold an invalid value over a
runtime check that catches it later.

## TypeScript

### Non-negotiable compiler settings

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,      // arr[0] is T | undefined — catches real bugs
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true,
  "isolatedModules": true,
  "target": "ES2023",
  "module": "NodeNext"
}
```

`noUncheckedIndexedAccess` is the one people try to remove. It stays.

### Type rules

| Rule | Detail |
|---|---|
| No `any` | Without an inline `// justified: <reason>` comment. Lint failure otherwise. Prefer `unknown` and narrow. |
| No non-null assertion `!` | Same rule. Narrow properly or handle the null. |
| No type assertions to widen | `as` is for narrowing after a validated check, never to silence the compiler. |
| Parse, don't validate | External data enters through a Zod schema at the boundary and is typed thereafter. Never trust a cast. |
| Prefer `type` over `interface` | Except when declaration merging is genuinely needed. |
| Discriminated unions for state | `{ status: 'running' } \| { status: 'failed', error: E }`, not optional fields everywhere. |
| Branded types for IDs | `type ProjectId = string & { __brand: 'ProjectId' }` — prevents passing a run ID where a project ID belongs. Cheap, catches real bugs. |
| Exhaustive switches | `default: assertNever(x)` on every union switch, so adding a variant is a compile error. |
| No enums | Use `as const` objects and union types. TS enums have surprising runtime semantics. |

### Error handling

```ts
// Domain errors are typed, carry a code, and are safe to surface.
export class DependencyCycleError extends DomainError {
  readonly code = "milestone_dependency_cycle";
  constructor(readonly cycle: MilestoneId[]) { super(`Cycle: ${cycle.join(" → ")}`); }
}
```

| Rule | Detail |
|---|---|
| Never swallow an error | No empty `catch`. If it's genuinely ignorable, comment why. |
| Never `catch (e) { throw new Error(String(e)) }` | Destroys the stack. Use `cause`. |
| Typed domain errors | Every expected failure is a named class with a stable `code`. |
| Result types for expected failures | Where failure is a normal outcome (validation, parsing), return a result rather than throwing. Throw for genuinely exceptional conditions. |
| One error boundary per layer | Errors become HTTP responses in exactly one place (§16 envelope). |
| Never leak internals | Message text is safe for a user to read. Details go to logs with a request ID. |

### Async

| Rule | Detail |
|---|---|
| Always `await` or explicitly `void` | Floating promises are lint failures. |
| `Promise.all` for independent work | Sequential `await` in a loop over independent items is a review rejection. |
| `AbortSignal` on every long operation | Cancellation must propagate — this matters enormously for interrupting agent runs. |
| Explicit timeouts on all I/O | No unbounded network wait, ever (NFR-FT-1). |
| No async in constructors | Use a static factory. |

### Naming

Names carry the design. These rules exist because unclear names are the most common cause of
misreading in review.

| Rule | Example |
|---|---|
| Reveal intent, not implementation | `readyTasks` not `filteredArray` |
| No abbreviations except universal ones | `organization` not `org` in code (`orgId` in a URL is fine); `id`, `url`, `db` are fine |
| Functions are verb phrases | `resolveReadyTasks`, `assertCanApprove` |
| Booleans read as assertions | `isBlocked`, `hasFailingTests`, `canDeploy` |
| Arrays are plural | `milestones`, not `milestoneList` |
| No `data`, `info`, `manager`, `helper`, `util` in a name | If you can't name it, the concept isn't clear yet |
| Units in the name | `timeoutMs`, `budgetCredits`, `costUsd` |
| Match the domain vocabulary exactly | If the docs say "milestone," the code says `milestone` — never `stage` or `phase` |

## React & frontend

| Rule | Detail |
|---|---|
| Server Components by default | `"use client"` is opt-in and must be justified in review |
| No business logic in components | Components render. Logic lives in the API or a hook. |
| No `useEffect` for data fetching | Server Components or a query library. `useEffect` for synchronization with external systems only. |
| Props are explicitly typed | No `React.FC`; no implicit `any` props |
| Semantic tokens only | No hex, no raw px, no hardcoded font size (§18 governance) |
| Every interactive element is keyboard-operable | Enforced by a11y lint + tests |
| Lists have stable keys | Never an array index for reorderable lists |
| Memoize only after measuring | `useMemo`/`memo` without a measured problem is noise |
| Virtualize above ~100 rows | Log streams and tables will exceed this constantly |

## SQL & data access

| Rule | Detail |
|---|---|
| Parameterized queries only | String-concatenated SQL is a lint failure |
| Every query is tenant-scoped | Through `TenantContext`; unscoped access is a build failure |
| `EXPLAIN` any query in a hot path | Before merge, not after an incident |
| No `SELECT *` in application code | Explicit columns; `*` breaks silently when the schema changes |
| Transactions are explicit and short | Never hold a transaction across an external call — especially not across a model call |
| Migrations are additive | Expand/contract; see §15 |

## Comments

**Comment to state what the code cannot show.**

| Write a comment for | Don't write a comment for |
|---|---|
| A non-obvious constraint (`// Postgres caps this at 63 chars`) | What the next line does |
| Why a surprising choice was made | Where the code came from |
| A link to the ADR or issue behind a decision | A restatement of the function name |
| A known limitation or accepted trade-off | An explanation that the change is correct — that's for the PR description |
| `// justified: <reason>` for `any`, `!`, or a lint disable | A changelog inside the file |

A comment explaining *what* usually means the code needs a better name. A comment explaining *why* is
often the most valuable line in the file.

## Prohibited

| Prohibited | Reason |
|---|---|
| `console.log` in application code | Use the structured logger; `console` bypasses redaction |
| Secrets, tokens, or keys in source | Secret scanning fails the build |
| PII or customer source code in logs | NFR-OBS-2 |
| `Date.now()` / `new Date()` in domain code | Inject the clock port; otherwise time-dependent logic is untestable |
| `Math.random()` for anything security-relevant | Use `crypto` |
| Floating-point money | `numeric`/integer minor units only |
| Mutating function arguments | Return new values |
| Default exports | Named exports only — better refactoring and grep-ability |
| Barrel `index.ts` re-exporting a package | Breaks tree-shaking, invites cycles |
| Commented-out code | Delete it. Git remembers. |
| `TODO` without an issue link | `// TODO(#412): …` or don't write it |
| Disabling a lint rule without justification | `// eslint-disable-next-line rule -- justified: <reason>` |

## Automated enforcement

Everything above that *can* be automated *is* automated. A standard that relies on reviewer memory is
a standard that erodes.

| Tool | Enforces | Live since |
|---|---|---|
| **TypeScript strict** | Type rules (full set in `packages/config/tsconfig.base.json`) | M002 |
| **ESLint** (typescript-eslint type-aware, import-x, unicorn, jsx-a11y) | Naming, prohibitions, floating promises, a11y | M002 |
| **eslint-plugin-boundaries** | Layer and module import rules (§19), both folder elements and file roles | M002 |
| **eslint-comments/require-description** | The `any` escape hatch must carry `-- justified: <reason>` | M002 |
| **Prettier** | Formatting — zero discussion, never in review | M002 |
| **dependency-cruiser** | No circular dependencies; domain purity | M002 |
| **commitlint** | Conventional Commits (§22) | M002 |
| **husky + lint-staged** | Pre-commit format/lint (~4 s) and commit-message lint | M002 |
| **gitleaks** | Secret scanning, pre-commit and CI | M003 |
| **knip** | Dead code and unused exports | M003 |
| **size-limit** | Bundle budgets (NFR-PERF-8) | M003 |
| **axe / Lighthouse CI** | Accessibility and performance budgets | M003 |

**Known gap:** the file-size rule is `max-lines` at **400 (warn)**. ESLint cannot express two
severities for one rule, so the **800-line hard fail** is a separate CI check landing in M003.

**Guardrails must be verified adversarially.** A linter config that produces a clean run has proven
nothing — it may simply be inert. Any change to `eslint.config.js` or `.dependency-cruiser.cjs`
must be accompanied by a deliberate violation demonstrating the rule still rejects it. M002 found
three separately-inert rules this way; the reasoning is recorded in comments inside both config
files, and those comments are load-bearing — do not "tidy" them away.

**Formatting is never a review comment.** If Prettier accepted it, it's correct.

## Code review

Reviewers check the things automation cannot:

1. Does this match the documented architecture, or does it need an ADR?
2. Is the tenant boundary respected on every data path?
3. Are the names right? Do they match the domain vocabulary?
4. Are the failure modes handled — timeout, retry, partial failure, cancellation?
5. Is the test meaningful, or does it just assert the implementation back at itself?
6. Is documentation updated in this PR?
7. Is this the simplest thing that works, or is it defending against a hypothetical?

**Reviewers report every finding with a severity and confidence, and do not self-filter for
importance.** Asking a reviewer to pre-filter for "only significant issues" measurably suppresses real
findings — the same lesson applies to our Code Reviewer agent (§13) and to humans.

## Related

- [19. Folder Structure](19-folder-structure.md)
- [22. Development Standards](22-development-standards.md)
- [23. Testing Strategy](23-testing-strategy.md)
- `skills/code-review-standards/` — per-language detail for 13 languages
