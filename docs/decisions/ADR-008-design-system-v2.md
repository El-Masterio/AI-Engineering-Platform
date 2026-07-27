# ADR-008 — Design System v2.0: warm neutral, light-only, orange-and-blue

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Project owner (directive), Lead Architect (implementation)
**Supersedes:** the visual half of [§18 Design System](../03-design/18-design-system.md) v1.0

## Context

The owner issued **UI/UX Design System Directive v2.0**, opening with: *"This document replaces all
previous UI and visual design decisions. The current UI does not match the intended design
language."*

That is an owner decision about the product's visual identity, not an engineering trade-off, and it
is not this ADR's job to relitigate it. What this ADR records is **what changed, what it broke, and
the three places where the directive as written could not be implemented literally**.

v1.0 was dark-first, near-black (`#0d1116`), with a deep-teal accent and a dense 13px type scale
aimed at a terminal-adjacent engineering tool. v2.0 is the opposite product surface: warm neutral
paper (`#f7f5f1`), orange as the action colour, blue as the secondary, generous whitespace, a 16px
body and 48px controls.

Three prior decisions are contradicted, which is why this ADR exists (standing rule 2):

| Contradicted | Where | Now |
|---|---|---|
| "Dark-first; light is a config change" | §18 v1.0 | Light is the product. There is no dark palette. |
| "Dark mode only in the MVP" | §8 | Light only in the MVP. |
| Dense 13px UI scale, 4px radii | §18 v1.0 | 14px UI / 16px body, 10–28px radii, 48px controls |

## The decision

Adopt the directive in full, with three documented deviations, all of them forced by
**NFR-A11Y-3 (WCAG 2.2 AA)** — a requirement that predates the directive and that the directive does
not address.

### Deviation 1 — derived shades for text-bearing colours

Before implementing anything, the specified palette was measured against WCAG 2.2 AA.
**20 of 23 load-bearing pairs failed.** The worst was the one the product leans on hardest: white
text on the primary orange `#f06d22` measures **3.04:1**, against the **4.5:1** a 15px button label
requires.

The resolution keeps every specified colour and adds a minimally darkened counterpart — same hue,
same saturation — only for roles that carry text:

| Role | Directive | Shipped | Why |
|---|---|---|---|
| Primary button fill | `#f06d22` | `#c8510e` | 3.04:1 → **4.53:1** under white |
| Orange as indicator | `#f06d22` | `#d95f18` | the directive's own *pressed* value; 3.07:1, clears 1.4.11 |
| Logo mark | `#f06d22` | `#f06d22` | unchanged — WCAG 1.4.3 exempts logotypes |
| Muted text | `#7c8797` | `#5f6978` | 3.34:1 → 4.55:1 |
| Placeholder | `#a2acba` | `#5f6978` | 2.30:1 → 4.55:1 |
| Control border | `#d3d9e2` | `#7386a3` | 1.42:1 → 3.04:1 (1.4.11) |
| Focus ring | `#7695e6` | `#5d81e1` | 2.91:1 → 3.02:1 |
| Link / nav-active text | `#7695e6` | `#3260da` | 2.91:1 → 4.50:1 |
| Status text (4) | spec | darkened | all were 2.3–3.4:1 on their own chips |

The vivid `#f06d22` is *not* discarded. It remains the brand orange in the logo mark, the gradients
and chart series 1 — every place where nothing depends on distinguishing it.

**The one thing an owner might want to reverse:** the primary button is a visibly deeper, more burnt
orange than the specified brand colour. Reversing it is one line — `--accent-bg: var(--o-500)` in
`tokens.css` — and costs AA conformance on every primary action in the product.

Decorative borders (card outlines, dividers) keep the directive's soft `#dad6cf` / `#e5e2dc`
unchanged: 1.4.11 governs *control boundaries*, not decoration, so the calm look the directive asks
for survives exactly where it matters visually.

### Deviation 2 — light only, and the theme machinery mostly deleted

The directive specifies one palette and lists "too dark" among the qualities to avoid. Rather than
invent thirty brand colours the owner never specified, dark mode is **removed**, not stubbed:
`toggleTheme`, `resolveInitialTheme`, `THEME_STORAGE_KEY` and the pre-paint `THEME_INIT_SCRIPT` are
gone, along with the topbar toggle and the Storybook theme control. With one palette there is
nothing to persist and no flash to prevent, and a toggle with one option is worse than no toggle.

What survives is the `data-theme` attribute and the two-layer token indirection. **M083 adds a dark
palette by writing one CSS block** — no component changes. This is not a claim; it is what just
happened in reverse, and it is now asserted by a test (see Consequences).

### Deviation 3 — 20px dropped from the spacing scale

The directive states an 8px base grid and then lists `4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96`.
`--space-5` (20px) existed in v1 and is not on that list, so it was removed rather than left
available. Every former use of it was a near-miss for 16 or 24.

## Options considered

### Option A — implement the palette literally

| | |
|---|---|
| **Advantages** | Exactly what was asked for. Zero interpretation. |
| **Disadvantages** | Ships a product that fails WCAG 2.2 AA on its primary button, every form border, every status chip, and all muted text. Contradicts NFR-A11Y-3, which is a stated requirement, and exposes the enterprise buyer the product targets (§4) to a procurement blocker. |

### Option B — darken the whole orange ramp to the accessible value

| | |
|---|---|
| **Advantages** | One orange. Nothing to explain. Fully conformant. |
| **Disadvantages** | Discards the vivid brand colour entirely. The directive's warmth is the point of v2.0, and `#c8510e` alone reads closer to brown. |

### Option C — specified colours for non-text roles, derived shades where text is involved ✅

| | |
|---|---|
| **Advantages** | Every specified colour survives and appears in the product. Full AA conformance. The split is mechanical and testable — 59 pairs gated in CI. |
| **Disadvantages** | Two oranges instead of one, which a designer must understand. The primary button is not the exact brand hex. Requires this ADR to be legible. |

**Chosen: C.** Accessibility is a requirement, not a preference; the brand is preserved everywhere
that requirement does not bite.

## Consequences

### Good

- **The two-layer token architecture paid for itself.** Every colour in the product changed, and not
  one component changed which token it reads. The re-skin was `tokens.css` plus geometry.
- Contrast is a build gate covering **59 pairs**, up from 40, and now checks every surface a token
  can land on — the sidebar (`#ece8e2`) is darker than the page and is where borderline values fail
  first. It found the two failures that survived the first pass.
- Three architectural claims that were previously prose are now tests: no component reaches past the
  semantic layer; the directive's palette cannot drift; `THEME_BASE_COLOR` cannot desync.
- Verified in a real browser across all five routes: **zero contrast failures** over 100+ rendered
  text nodes, measured against actual computed backgrounds rather than token values.

### Bad / accepted

- Dark mode is gone until M083. Anyone who was using it loses it.
- Two oranges is a real cognitive cost on the design system.
- `--o-500` now appears in the UI only as the logo mark and in gradients. If a future reviewer asks
  "why is the brand colour barely used", the answer is this ADR.

### Neutral

- Fonts moved from Inter-only to **Manrope** (display) + **Inter** (UI) + **JetBrains Mono**, all
  self-hosted by `next/font`. No runtime CDN request.
- The topbar lost its breadcrumb: the directive specifies four items and says "no visual clutter".
  Page headings are now the sole wayfinding, which is a real reduction in nested-route context.

## Verification

```
format:check   exit=0     depcruise      exit=0     test           exit=0  (52)
lint           exit=0     check:contrast exit=0     build          exit=0
typecheck      exit=0     └─ 59 pairs checked · 0 failing
```

Adversarial probes (a passing gate proves nothing until it fails):

| Probe | Result |
|---|---|
| Reference `var(--w-100)` from `badge.tsx` | ✅ failed, named the file |
| Drift `--o-500` to `#ff6a00` | ✅ failed |
| Drift `--w-150` to `#eeeeee` | ✅ failed |
| Drift `--chart-4` to `#22c55e` | ✅ failed |

The palette test **initially did not fail** on the `--o-500` probe — it used `toContain`, and
`#f06d22` also appears in `--chart-1`, in `--gradient-primary` and in a comment. It now asserts the
declaration, not the substring. This is the second time this project has shipped an inert guardrail
that a clean run would have hidden.

## Related

- [§18 Design System v2.0](../03-design/18-design-system.md) — the full specification
- [ADR-007](ADR-007-verification-gates-structural.md) — why gates are structural, not advisory
- [§11 Non-functional requirements](../01-requirements/11-non-functional-requirements.md) — NFR-A11Y-3
- `packages/ui/src/tokens/tokens.css` · `scripts/check-contrast.mjs`
