# 18. UI/UX Design System Specification

**Version 2.0** · 2026-07-27 · supersedes v1.0 in full.

> v2.0 encodes the owner's **UI/UX Design System Directive v2.0**, which opens: *"This document
> replaces all previous UI and visual design decisions."* v1.0 — dark-first, near-black, deep teal,
> 13px dense — is gone. See [ADR-008](../decisions/ADR-008-design-system-v2.md) for what changed,
> what it contradicted, and the three places the directive could not be implemented literally.
>
> **This document is the single source of truth for the visual identity of the platform until
> explicitly replaced by a newer version.** Every screen, dashboard, dialog, form, settings page,
> project view, agent interface, analytics page and admin page follows it.

## Design direction

The interface should feel like a **premium software company**, not an AI chatbot. A user should
trust it on sight.

It communicates: confidence · organization · engineering excellence · simplicity · professionalism ·
calm.

Reference quality bar — for *philosophy and craft only*, never layout or asset imitation: Base44,
Linear, Vercel, Stripe Dashboard, OpenAI Platform, Notion AI, Anthropic Console.

### Anti-goals

Nothing here should read as **cyberpunk, gaming, neon, crypto, futuristic, flashy, over-animated,
too dark, or too colourful**. No glassmorphism, no glow, no thick borders, no oversized shadows, no
decoration that isn't doing a job.

### The five questions

Every component answers all five before it ships:

1. Is it simple?
2. Is it readable?
3. Is it professional?
4. Can anything be removed?
5. Does it pass the contrast gate?

**Prefer reduction over addition.**

---

## Colour

Warm neutral is the substrate. **Orange is the primary accent. Blue is the secondary.** Slate
supplies professional balance.

**Distribution target:** ~60% warm neutral · 15% orange · 15% blue · 10% slate.

| Colour is for | Not for |
|---|---|
| **Orange** — primary buttons, important actions, active indicators, progress | anything decorative, or any second thing in the same component as blue |
| **Blue** — charts, secondary actions, focus states, selected navigation, links | primary actions |

Never put orange and blue inside the same component unless there is no alternative.

### The accessibility split — read this before touching a colour

The directive's palette was measured against WCAG 2.2 AA (NFR-A11Y-3) before implementation.
**20 of 23 load-bearing pairs failed.** Rather than discard the palette or ship an inaccessible
product, every specified colour is kept and used wherever the requirement is 3:1 or already met; a
minimally darkened counterpart — same hue, same saturation — carries the roles that involve text.

**The rule of thumb: the vivid brand colours are for things you look at. The derived shades are for
things you read.**

| Role | Directive value | Shipped | Ratio |
|---|---|---|---|
| Brand mark, gradients, chart 1 | `#f06d22` | `#f06d22` | logotype exemption (1.4.3) |
| Orange indicator, progress fill | `#f06d22` | `#d95f18` | 3.07:1 ✔ |
| **Primary button fill** | `#f06d22` | **`#c8510e`** | **4.53:1** (was 3.04:1) |
| Orange as text | `#f06d22` | `#b1480c` | 4.53:1 |
| Muted text | `#7c8797` | `#5f6978` | 4.55:1 (was 3.34:1) |
| Placeholder | `#a2acba` | `#5f6978` | 4.55:1 (was 2.30:1) |
| Control border | `#d3d9e2` | `#7386a3` | 3.04:1 (was 1.42:1) |
| Focus ring | `#7695e6` | `#5d81e1` | 3.02:1 |
| Link, active nav text | `#7695e6` | `#3260da` | 4.50:1 |
| Success / warning / error / info text | spec | darkened | 4.5:1+ |

Decorative borders — card outlines and dividers — keep the directive's soft `#dad6cf` and `#e5e2dc`
**unchanged**. WCAG 1.4.11 governs control boundaries, not decoration, which is precisely why the
interface still looks as quiet as the directive asks.

### The specified palette

Every value below is in `packages/ui/src/tokens/tokens.css` and asserted by a test.

**Brand**

| | |
|---|---|
| Primary orange | `#f06d22` |
| Hover orange | `#ff7a2c` |
| Pressed orange | `#d95f18` |
| Soft orange | `#ffe9db` |
| Sky blue | `#7695e6` |
| Sky blue hover | `#87a4ef` |
| Light blue | `#e6edff` |
| Slate blue | `#5f6ea8` |
| Light slate | `#c7d2f5` |

**Surfaces**

| | |
|---|---|
| Primary background | `#f7f5f1` |
| Secondary background | `#f1eee9` |
| Sidebar | `#ece8e2` |
| Cards | `#ffffff` |
| Elevated surface | `#fbfaf8` |

**Text** — primary `#1e2430` · secondary `#556070` · muted `#7c8797` · placeholder `#a2acba` ·
disabled `#c3cbd6`

**Borders** — primary `#dad6cf` · secondary `#e5e2dc` · input `#d3d9e2`

**Status** — success `#34b56a` on `#edf9f1` · warning `#d99b22` on `#fff8e8` · error `#d95a5a` on
`#fff0f0` · info `#5e8fe8` on `#eef4ff`

**Charts** — `#f06d22` `#7695e6` `#5f6ea8` `#34b56a` `#d99b22` `#bfc8d3`. No additional series
colours unless a chart genuinely needs them.

**Gradients** — extremely subtle, never a large colourful field.
Primary `#f06d22 → #ff8c4a` · Secondary `#7695e6 → #a7bbf5` · Neutral `#ffffff → #f5f2ee`

### Token architecture — the load-bearing part

Two layers, and the separation is what makes the system survivable:

- **Primitives** (`--w-*`, `--s-*`, `--o-*`, `--b-*`, `--ok-*`, …) are raw scales. **A component may
  never reference one.** They generate no Tailwind utility, so there is no accidental path to one,
  and a test fails the build if a component finds one anyway.
- **Semantic** (`--bg-*`, `--text-*`, `--border-*`, `--accent-*`, `--status-*`) are what components
  read.

The proof this works is v2.0 itself: **every colour in the product changed and not one component
changed which token it reads.** The re-skin was one CSS file plus geometry.

### Themes

**Light is the product, not a mode.** The directive specifies one palette and names "too dark" among
the things to avoid, so there is no dark palette and no toggle — `toggleTheme`, the storage key and
the pre-paint script were deleted rather than left inert.

The `data-theme` attribute and the token indirection survive. **M083 adds dark by writing one CSS
block**, with no component changes.

---

## Typography

| Face | Role | Why |
|---|---|---|
| **Manrope** | display, headings, KPI values | enough character to give the product an identity |
| **Inter** | body, UI, labels, tables | larger x-height; reads better at 13–16px |
| **JetBrains Mono** | code, logs, diffs, IDs | true monospace with a clear `0`/`O`, `1`/`l` |

All three are self-hosted by `next/font` — no runtime CDN request, no layout shift.

**Weights:** 400 regular · 500 medium · 600 semibold · 700 bold · 800 extra-bold.

**Scale** — declared in `rem` so the browser's font-size preference is honoured (NFR-A11Y):

| Step | Size | Use |
|---|---|---|
| Hero | 64px | marketing only |
| H1 | 52px | marketing, empty-state headlines |
| H2 | 40px | KPI values |
| H3 | 32px | page titles |
| H4 | 24px | section titles, dialog titles |
| H5 | 20px | card titles |
| Body | 16px | prose, inputs |
| Small | 14px | **default UI text** |
| Caption | 13px | labels, badges, table meta |
| Button | 15px | control labels |

Headings set in Manrope at `-0.02em` tracking — display sizes need the tightening; body does not.

---

## Spacing, radius, geometry

**8px base grid.** Sanctioned steps, and only these:

`4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64 · 80 · 96`

20px was removed in v2.0: it is off the grid, and every prior use was a near-miss for 16 or 24.

**Radius** — small `10px` · medium `14px` · large `20px` · extra-large `28px` · control `12px` ·
full `9999px`. Controls sit slightly tighter than their containers so a control inside a card does
not read as a second card.

**Controls** — default height `48px`, dense `36px`, large `56px`, horizontal padding `24px`.

**Layout** — max content width `1440px` · sidebar `264px` / `72px` collapsed · topbar `64px` ·
prose `72ch`. Desktop first, then tablet, then mobile.

**Shadows should almost disappear.** The border does the separating; the shadow only lifts a card off
the warm background by a hair. Card default is `0 8px 30px rgb(25 25 25 / 0.05)`.

---

## Motion

**150–200ms, `ease-in-out`, no bounce.** Motion supports usability; it is never decoration.

| Allowed | Forbidden |
|---|---|
| State transitions (hover, focus, open/close) | Anything purely decorative |
| Layout changes the user caused | Bounce, elastic, overshoot |
| Progress and streaming indicators | Animating a card upward on hover |
| Skeleton → content | Any motion over 200ms in the app surface |

`prefers-reduced-motion` is honoured globally.

---

## Component library

Built on **Radix primitives** (accessible behaviour) styled entirely by us (original visual
language).

### Foundations

| Component | Notes |
|---|---|
| **Button** | Variants `primary`/`secondary`/`ghost`/`danger`. Sizes `sm`/`md`/`lg` (36/48/56px). 14px radius, 15px label. Primary fills `--accent-bg`, **not** the brand orange — see the accessibility split. Mandatory `loading` and `disabled`. Icon-only requires `aria-label`. |
| **Card** | White, `--border-subtle` hairline, 20px radius, 24px padding, near-invisible shadow. `interactive` for link-cards — and it does **not** raise on hover. |
| **StatCard** | The large KPI card. Value at 40px Manrope. No sparkline, no icon, no coloured delta arrow: a KPI is a number with a name. |
| **Input / Textarea / Select** | 48px, 12px radius, 16px padding, 16px text. Label always visible — never placeholder-as-label. Error pairs colour with an icon and text. |
| **Checkbox / Radio / Switch** | Switch for immediate effect; checkbox for deferred submission. |
| **Badge** | Tinted background with its own darkened foreground — a chip is a small target on a coloured field. |
| **Avatar** | User and agent. Agents get a role glyph, never a fake human face. |
| **Tooltip** | Supplementary only. Never the sole carrier of information. |
| **Icon** | One family (Lucide), outline, rounded, 16/20/24px, **1.75px stroke**. Decorative icons are `aria-hidden`. |

### Structure

| Component | Notes |
|---|---|
| **AppShell** | Sidebar + top navigation + content. Persists collapse state across reloads. |
| **Sidebar** | `#ece8e2`, muted slate icons. Active item = **blue left bar + soft blue field + blue label** — three signals, only one of them colour. Collapsed links keep their accessible names. |
| **Top navigation** | Exactly four things: workspace switcher, search, notifications, user menu. **No breadcrumb** — the directive calls it clutter; page headings carry wayfinding. |
| **PageHeader** | Title (32px Manrope), one line of context, optional actions. Every screen opens the same way. |
| **Panel / Drawer** | Right-side drawer for run detail without losing list context. |
| **Tabs / Accordion / Separator** | Standard, keyboard-complete. |
| **EmptyState** | Icon, headline, one sentence, one primary action. Every list has one. |
| **Skeleton** | Structural placeholders matched to real content dimensions — no layout shift on load. |

### Data display

| Component | Notes |
|---|---|
| **DataTable** | Minimal. Thin dividers, no heavy borders, alternating hover, large spacing. Sticky header, sortable, keyboard navigable, virtualized above 100 rows. |
| **DefinitionList** | The dominant pattern for detail views — label/value pairs beat forms for read-heavy screens. |
| **CodeBlock** | Line numbers, copy button, language label, wrap toggle. Shiki highlighting mapped to our tokens. |
| **DiffViewer** | Unified and split. `--diff-add-bg`/`--diff-del-bg` **plus** `+`/`−` gutter markers so it works without colour. |
| **LogStream** | Virtualized, auto-scroll with a "jump to latest" affordance the moment the user scrolls up. Never re-render the whole list on append. |
| **Timeline** | Run events in sequence: tool calls, messages, gates, results. The primary run-detail surface. |
| **StatusIndicator** | The single most-used component. Icon + label + colour. States: `queued`, `running`, `blocked`, `awaiting_approval`, `passed`, `failed`, `cancelled`. Icon and label share a colour, so that colour meets the **4.5:1 text** threshold, not the 3:1 graphic one. |
| **CostMeter** | Spent / estimated / ceiling, as a bar plus exact figures. Never only a bar — engineers want the number. |
| **MilestoneBoard** | Dependency-aware plan view. Blocked milestones visibly blocked and *by what*. |

### Feedback

| Component | Notes |
|---|---|
| **Toast** | Transient success/info. Never for errors requiring action. |
| **Alert** | Inline, persistent. The correct home for actionable errors. |
| **Dialog** | Confirmations. Destructive actions require typing the resource name. |
| **ApprovalGate** | Deliberately prominent. Shows exactly what is being approved, its cost, and its blast radius. **Never** styled as an ordinary button — approving a production deploy must not feel like dismissing a toast. |
| **ProgressIndicator** | Determinate where a real fraction exists; indeterminate otherwise. Never fake a percentage. Fill uses `--accent`. |

### Charts (Phase 6)

Simple. Minimal labels, no decoration. Six-colour categorical palette above, verified distinguishable.
Never colour-only encoding; axis labels always present.

---

## Key screens

| Screen | Job it does |
|---|---|
| **Project list** | Status at a glance: KPI row, then project cards — active runs, awaiting approval, spend |
| **Project overview** | Goal, milestone progress, recent activity, cost, health |
| **Plan approval** | The most important screen in the product. Architecture note, ordered milestones, dependencies, credit estimate, editable before approval |
| **Milestone board** | Plan execution state, blockers, and *why* something is blocked |
| **Run detail** | Live timeline + streamed output + tool calls + diffs + test results + cost, in one view |
| **Review detail** | Findings by severity with file/line links; accept, dispute, or re-run |
| **Memory browser** | What the project knows; editable; version history |
| **Cost dashboard** | Spend by project/milestone/agent/tier; forecast; budget management |
| **Audit log** | Filterable, exportable record of everything |

**Layout law for the run view:** the user must see *what the agent is doing now* and *what it has
done* without switching context. A persistent timeline with a detail pane — not a tab that hides
history behind a click.

---

## Accessibility (binding, not aspirational)

| Requirement | Implementation |
|---|---|
| WCAG 2.2 AA | Automated axe in CI; manual screen-reader audit each phase gate |
| Contrast | **59 token pairs gated in CI** across every surface a token can land on. A failing pair fails the build. Verified again in a real browser against computed backgrounds |
| Keyboard complete | Every action reachable; visible focus ring (`--border-focus`, 2px, 2px offset); logical tab order |
| Never colour-only | Status = icon + text + colour. Diffs = colour + gutter marker. Active nav = bar + field + weight + colour |
| Streaming output | Batched `aria-live="polite"`, coalesced to at most one per ~2s. Per-token announcement would be unusable |
| Reduced motion | Global override honoured |
| Semantic HTML first | ARIA only where semantics are insufficient |
| Forms | Labels bound to controls; errors programmatically associated; never rely on placeholder text |

The one documented exemption: the logo mark's letter sits on `#f06d22` at 3.04:1, permitted by WCAG
1.4.3's logotype exemption and marked `data-logotype` in the DOM so the exemption is visible rather
than assumed.

---

## Governance

1. **No hardcoded values.** No hex colour, `rgb()`/`hsl()` call, or raw font size in a component.
   Enforced by `no-restricted-syntax` in `eslint.config.js`.
2. **Semantic tokens only** in components. A direct `var(--w-100)` primitive reference is both a lint
   error and a test failure, and primitives generate no Tailwind utility.
3. **The specified palette cannot drift.** A test asserts 26 token *declarations* against the
   directive's values. (It asserted mere presence at first and was inert — `#f06d22` also appears in
   `--chart-1` and the gradient.)
4. **New component requires:** all states (default, hover, focus, active, disabled, loading, error,
   empty), keyboard operation, an a11y test, and a Storybook entry.
5. **New token requires an ADR** — the token set is a contract with every future component.
6. **Only the sanctioned spacing steps.** A PR introducing an off-grid value gets pushed back.
7. **Visual regression tests** on the component library (Phase 4).

## Related

- [ADR-008 — Design System v2.0](../decisions/ADR-008-design-system-v2.md) — why v1 was replaced,
  and the three deviations from the directive
- [11. Non-Functional Requirements](../01-requirements/11-non-functional-requirements.md) (§9 Accessibility)
- [14. Technology Stack](../02-architecture/14-technology-stack.md)
- `packages/ui/src/tokens/tokens.css` · `scripts/check-contrast.mjs`
- The `frontend-design`, `frontend-engineering` and `dataviz` skills inform implementation;
  `build-premium-website` covers marketing-site work, which follows a *separate* visual language.
