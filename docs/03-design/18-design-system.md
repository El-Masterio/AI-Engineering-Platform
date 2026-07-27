# 18. UI/UX Design System Specification

## Design direction

**Base44 is a stated inspiration for design *philosophy* only.** We take: premium SaaS feel, modern
typography, minimal interface, generous spacing, clean hierarchy, dark-first, subtle gradients, soft
shadows, rounded components, high readability, enterprise professionalism.

**We take nothing else.** No assets, no branding, no graphics, no illustrations, no layouts, no
copy, no code, no proprietary content. The output must be an original design language that stands on
its own. If a screen would be recognizable as someone else's product, it is wrong.

## Design thesis

> **Calm, dense, and legible. The interface should feel like an instrument panel operated by a
> professional — not a consumer app trying to delight.**

Users watch agents work for minutes at a time and read a great deal of text: diffs, logs, review
findings, plans. Three consequences drive every decision below:

1. **Reading comfort outranks visual impact.** Long-session legibility is the primary constraint.
2. **Motion must be informative, never decorative.** Movement in this UI means "something changed" —
   spending it on flourish destroys its signal value.
3. **Density is a feature.** Engineers want more information per screen, not fewer things with more
   padding. We are generous with *whitespace between groups* and tight *within* them.

### Anti-goals

No gimmicks. No unnecessary animation. No visual clutter. No purple-gradient-on-dark "AI product"
aesthetic — that look is now the default and reads as unconsidered. No mystery-meat icons without
labels. No hiding state behind hover. No emoji as UI.

---

## Design tokens

Tokens are **CSS custom properties**, not compiled Tailwind values. This is what makes theming a
runtime concern and Phase 4's light mode a config change rather than a re-skin.

### Color architecture

Two layers. **Primitives** are raw scales, never referenced by a component. **Semantic tokens** are
what components use. Changing a theme means remapping semantics, not editing components.

```css
:root {
  /* ── Primitives — neutral (slightly cool, never pure grey) ────────── */
  --n-0:  #ffffff;
  --n-50: #f7f8f9;  --n-100:#eef0f2;  --n-200:#dde1e5;
  --n-300:#c2c8cf;  --n-400:#9aa3ad;  --n-500:#727c88;
  --n-600:#525c68;  --n-700:#3a434e;  --n-800:#252c35;
  --n-850:#1b2129;  --n-900:#141920;  --n-950:#0d1116;
  --n-1000:#080b0e;

  /* ── Primitives — accent (deep teal: technical, calm, not "AI purple") */
  --a-300:#5eead4;  --a-400:#2dd4bf;  --a-500:#14b8a6;
  --a-600:#0d9488;  --a-700:#0f766e;  --a-800:#115e59;

  /* ── Primitives — status ──────────────────────────────────────────── */
  --ok-400:#4ade80;   --ok-600:#16a34a;
  --warn-400:#fbbf24; --warn-600:#d97706;
  --err-400:#f87171;  --err-600:#dc2626;
  --info-400:#60a5fa; --info-600:#2563eb;
  --run-400:#a78bfa;  --run-600:#7c3aed;   /* agent "working" only */
}

/* ── Semantic tokens — dark theme (default) ─────────────────────────── */
:root, [data-theme="dark"] {
  --bg-base:        var(--n-950);
  --bg-surface:     var(--n-900);
  --bg-surface-2:   var(--n-850);
  --bg-inset:       var(--n-1000);   /* code blocks, logs, terminals */
  --bg-hover:       var(--n-800);
  --bg-selected:    color-mix(in oklab, var(--a-500) 14%, transparent);

  --border-subtle:  var(--n-800);
  --border-default: var(--n-700);
  --border-strong:  var(--n-600);
  --border-focus:   var(--a-400);

  --text-primary:   var(--n-50);
  --text-secondary: var(--n-300);
  --text-tertiary:  var(--n-400);   /* 4.6:1 on --bg-base — verified */
  --text-inverse:   var(--n-950);
  --text-accent:    var(--a-400);

  --accent-bg:      var(--a-600);
  --accent-bg-hover:var(--a-500);
  --accent-fg:      var(--n-950);

  --status-ok:      var(--ok-400);
  --status-warn:    var(--warn-400);
  --status-err:     var(--err-400);
  --status-info:    var(--info-400);
  --status-running: var(--run-400);

  --diff-add-bg:    color-mix(in oklab, var(--ok-600) 18%, transparent);
  --diff-del-bg:    color-mix(in oklab, var(--err-600) 18%, transparent);

  --shadow-sm: 0 1px 2px rgb(0 0 0 / .40);
  --shadow-md: 0 4px 12px rgb(0 0 0 / .35);
  --shadow-lg: 0 12px 32px rgb(0 0 0 / .45);
}

/* ── Semantic tokens — light theme (Phase 4) ────────────────────────── */
[data-theme="light"] {
  --bg-base: var(--n-50);   --bg-surface: var(--n-0);
  --bg-surface-2: var(--n-50); --bg-inset: var(--n-100);
  --bg-hover: var(--n-100);
  --border-subtle: var(--n-200); --border-default: var(--n-300);
  --text-primary: var(--n-900); --text-secondary: var(--n-700);
  --text-tertiary: var(--n-500);  /* 4.7:1 on --bg-base — verified */
  --accent-bg: var(--a-700); --accent-fg: var(--n-0);
  --status-ok: var(--ok-600); --status-warn: var(--warn-600);
  --status-err: var(--err-600); --status-running: var(--run-600);
  --shadow-sm: 0 1px 2px rgb(16 24 32 / .06);
  --shadow-md: 0 4px 12px rgb(16 24 32 / .08);
  --shadow-lg: 0 12px 32px rgb(16 24 32 / .12);
}
```

**Rules:**
- Components reference **semantic tokens only**. A primitive in a component is a review rejection.
- Both themes are contrast-verified against WCAG 2.2 AA (NFR-A11Y-3). Contrast is a build check, not
  a designer's judgment.
- `--status-running` is the only place the violet appears. Reserving it makes "an agent is working"
  instantly readable, and keeps us clear of the generic AI-purple look everywhere else.
- **Status is never communicated by color alone** (NFR-A11Y-5) — every status carries an icon and a
  text label.

### Typography

```css
:root {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "SF Mono", monospace;

  /* Type scale — 1.200 ratio, rem-based, respects user font size */
  --text-2xs:  0.6875rem; /* 11px — dense table meta, timestamps */
  --text-xs:   0.75rem;   /* 12px — labels, badges */
  --text-sm:   0.8125rem; /* 13px — DEFAULT UI text and code */
  --text-base: 0.9375rem; /* 15px — body prose */
  --text-lg:   1.125rem;  /* 18px — card titles */
  --text-xl:   1.375rem;  /* 22px — section headings */
  --text-2xl:  1.75rem;   /* 28px — page titles */
  --text-3xl:  2.25rem;   /* 36px — marketing only */

  --leading-tight: 1.25;  --leading-snug: 1.4;
  --leading-normal:1.55;  --leading-relaxed: 1.7;  /* long-form docs */

  --weight-normal:400; --weight-medium:500;
  --weight-semibold:600; --weight-bold:700;

  --tracking-tight:-0.011em;  /* headings ≥ text-xl */
  --tracking-normal:0;
  --tracking-wide:0.02em;     /* all-caps labels only */
}
```

**Rules:**
- **`--text-sm` (13px) is the default UI size**, not 16px. Deliberate: this is a dense professional
  tool. Long-form prose (docs, ADRs, plan descriptions) uses `--text-base` with `--leading-relaxed`.
- Monospace for code, IDs, paths, branch names, token counts, and costs — anything the user might
  compare character by character.
- Sizes in `rem` so browser font-size preferences are respected (NFR-A11Y).
- Maximum measure for prose: `72ch`. Unbounded line length is the most common readability failure in
  developer tools.
- Variable fonts, self-hosted, subset, `font-display: swap`.

### Spacing, radius, layout

```css
:root {
  --space-0:0; --space-px:1px;
  --space-1:0.25rem;  --space-2:0.5rem;   --space-3:0.75rem;
  --space-4:1rem;     --space-5:1.25rem;  --space-6:1.5rem;
  --space-8:2rem;     --space-10:2.5rem;  --space-12:3rem;
  --space-16:4rem;    --space-20:5rem;    --space-24:6rem;

  --radius-sm:4px;  --radius-md:6px;   --radius-lg:10px;
  --radius-xl:14px; --radius-full:9999px;

  --container-content:1280px;   /* dashboard max width */
  --container-prose:72ch;
  --sidebar-w:248px;
  --sidebar-w-collapsed:56px;
  --topbar-h:52px;

  --z-base:0; --z-sticky:10; --z-dropdown:20; --z-overlay:30;
  --z-modal:40; --z-toast:50; --z-tooltip:60;
}
```

4px base grid. **Generous *between* groups (`--space-8`+), tight *within* (`--space-2`–`--space-3`).**
That combination is what makes a dense UI feel calm rather than cramped.

**Grid:** 12-column, `--space-6` gutters, `--container-content` max. Breakpoints: `sm` 640 ·
`md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536. **Desktop-first** — this is a professional tool used at
a desk. Tablet is supported from Phase 4; phone is read-only monitoring, never authoring.

### Motion

```css
:root {
  --dur-instant:80ms; --dur-fast:140ms;
  --dur-normal:200ms; --dur-slow:320ms;
  --ease-out:cubic-bezier(.16,1,.3,1);
  --ease-in-out:cubic-bezier(.4,0,.2,1);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important; scroll-behavior:auto !important;
  }
}
```

**Motion budget — motion is only permitted to communicate state:**

| Permitted | Duration |
|---|---|
| Hover / focus feedback | `--dur-instant` |
| Disclosure (accordion, dropdown, popover) | `--dur-fast` |
| Modal and drawer entry | `--dur-normal` |
| New streamed content arriving | subtle fade, `--dur-fast` |
| Indeterminate agent-working indicator | continuous, low-amplitude |

Everything else — decorative parallax, scroll-triggered reveals, gradient animation, spring physics on
buttons — is **prohibited**. Streaming agent output must never animate per-token; that is unreadable
at speed and hostile to screen readers.

---

## Component library

Built on **Radix primitives** (accessible behavior) styled entirely by us (original visual language).

### Foundations

| Component | Notes |
|---|---|
| **Button** | Variants: `primary`, `secondary`, `ghost`, `danger`. Sizes: `sm`/`md`/`lg`. Mandatory `loading` and `disabled` states. Icon-only requires `aria-label`. |
| **Input / Textarea / Select / Combobox** | Label always visible — never placeholder-as-label. Error state pairs color with an icon and text. |
| **Checkbox / Radio / Switch** | Switch for immediate effect; checkbox for deferred submission. |
| **Badge** | Status and metadata. Always icon + text. |
| **Avatar** | User and agent. Agents get a role glyph, never a fake human face. |
| **Tooltip** | Supplementary only. Never the sole carrier of information. |
| **Icon** | One family (Lucide), 16/20/24px, `1.5px` stroke. Decorative icons are `aria-hidden`. |

### Structure

| Component | Notes |
|---|---|
| **AppShell** | Collapsible sidebar + topbar + content. Persists collapse state. |
| **Card** | `--bg-surface`, `--border-subtle`, `--radius-lg`. Optional header/footer. Shadows are *soft and low* — `--shadow-sm` at rest. |
| **Panel / Drawer** | Right-side drawer for run detail without losing list context. |
| **Tabs / Accordion / Breadcrumb / Separator** | Standard, keyboard-complete. |
| **EmptyState** | Icon, headline, one sentence, one primary action. Every list has one. |
| **Skeleton** | Structural placeholders matched to real content dimensions — no layout shift on load. |

### Data display

| Component | Notes |
|---|---|
| **DataTable** | Sticky header, sortable columns, row selection, keyboard navigation, resizable columns, virtualized above 100 rows. Dense by default. |
| **DefinitionList** | The dominant pattern for detail views — label/value pairs beat forms for read-heavy screens. |
| **CodeBlock** | `--bg-inset`, line numbers, copy button, language label, wrap toggle. Shiki highlighting with a custom theme mapped to our tokens. |
| **DiffViewer** | Unified and split modes. `--diff-add-bg`/`--diff-del-bg` **plus** `+`/`−` gutter markers so it works without color. Collapsible unchanged hunks. |
| **LogStream** | Virtualized, auto-scroll with a "jump to latest" affordance that appears the moment the user scrolls up. ANSI color support. Never re-render the whole list on append. |
| **Timeline** | Run events in sequence: tool calls, messages, gates, results. The primary run-detail surface. |
| **StatusIndicator** | The single most-used component. Dot + icon + label. States: `queued`, `running`, `blocked`, `awaiting_approval`, `passed`, `failed`, `cancelled`. |
| **CostMeter** | Spent / estimated / ceiling, as a bar plus exact figures. Never only a bar — engineers want the number. |
| **MilestoneBoard** | Dependency-aware plan view. Blocked milestones visibly blocked and *by what*. |
| **DependencyGraph** | Directed graph of milestones/tasks. Read-only in v1. |

### Feedback

| Component | Notes |
|---|---|
| **Toast** | Transient success/info. Never for errors requiring action. |
| **Alert** | Inline, persistent, dismissible-or-not. The correct home for actionable errors. |
| **Dialog** | Confirmations. Destructive actions require typing the resource name. |
| **ApprovalGate** | A distinct, deliberately prominent component. Shows exactly what is being approved, its cost, and its blast radius. **Never** styled as an ordinary button — approving a production deploy must not feel like dismissing a toast. |
| **ProgressIndicator** | Determinate where a real fraction exists; indeterminate otherwise. Never fake a percentage. |

### Charts (Phase 6)

Cost over time, token breakdown by tier, milestone throughput, review-finding rates. Follow the
`dataviz` skill's guidance: categorical palette derived from our tokens, verified in both themes,
never color-only encoding, axis labels always present.

---

## Key screens

| Screen | Job it does |
|---|---|
| **Project list** | Status at a glance across projects: active runs, awaiting approval, spend |
| **Project overview** | Goal, milestone progress, recent activity, cost, health |
| **Plan approval** | The most important screen in the product. Architecture note, ordered milestones, dependencies, credit estimate, editable before approval |
| **Milestone board** | Plan execution state, blockers, and *why* something is blocked |
| **Run detail** | Live timeline + streamed output + tool calls + diffs + test results + cost, in one view |
| **Review detail** | Findings by severity with file/line links; accept, dispute, or re-run |
| **Memory browser** | What the project knows; editable; version history |
| **Capability packs** | Org standards: author, version, see which agents inherit them |
| **Cost dashboard** | Spend by project/milestone/agent/tier; forecast; budget management |
| **Audit log** | Filterable, exportable record of everything |

**Layout law for the run view:** the user must be able to see *what the agent is doing now* and
*what it has done* without switching context. That means a persistent timeline with a detail pane —
not a tab that hides history behind a click.

---

## Accessibility (binding, not aspirational)

| Requirement | Implementation |
|---|---|
| WCAG 2.2 AA | Automated axe in CI; manual screen-reader audit each phase gate |
| Keyboard complete | Every action reachable; visible focus ring (`--border-focus`, 2px, 2px offset); logical tab order; documented shortcuts |
| Contrast | Verified in both themes in CI — a failing pair fails the build |
| Never color-only | Status = dot + icon + text. Diffs = color + gutter marker |
| Streaming output | Batched `aria-live="polite"` announcements, coalesced to at most one per ~2 s. Per-token announcement would be unusable |
| Reduced motion | Global override honored |
| Semantic HTML first | ARIA only where semantics are insufficient |
| Forms | Labels bound to controls; errors programmatically associated; never rely on placeholder text |

Long agent runs are exactly where naive live-region implementations flood assistive technology. The
coalescing rule above is a hard requirement, not a refinement.

---

## Governance

1. **No hardcoded values.** No hex color, px spacing, or raw font size in a component. Enforced by
   lint.
2. **Semantic tokens only** in components.
3. **New component requires:** all states (default, hover, focus, active, disabled, loading, error,
   empty), both themes, keyboard operation, a11y test, and a Storybook entry.
4. **New token requires** an ADR — the token set is a public contract with every future component.
5. **Visual regression tests** on the component library (Phase 4).
6. **Density is reviewed.** A PR that adds padding without a stated reason gets pushed back.

## Related

- [11. Non-Functional Requirements](../01-requirements/11-non-functional-requirements.md) (§9 Accessibility)
- [14. Technology Stack](../02-architecture/14-technology-stack.md)
- The `frontend-design`, `frontend-engineering`, and `dataviz` skills inform component
  implementation; `build-premium-website` covers marketing-site work, which follows a *separate*
  visual language from the application.
