/**
 * Theme application.
 *
 * The theme is an attribute on <html>, not a class and not a rebuild: every
 * semantic token is a CSS custom property, so setting `data-theme` re-resolves
 * the whole design system in one paint (§18).
 *
 * ── ONE THEME, DELIBERATELY ─────────────────────────────────────────────────
 * Design System v2.0 specifies exactly one palette — warm neutral, light — and
 * names "too dark" among the qualities to avoid. Light is therefore the
 * product, not a mode, and this module has no toggle, no persistence and no
 * pre-paint script: with a single theme there is nothing to remember and no
 * flash to prevent. All three were deleted rather than left inert.
 *
 * What survives is the mechanism: the `data-theme` attribute and the token
 * indirection behind it. M083 can add a dark palette by writing a
 * `[data-theme="dark"]` block in tokens.css and restoring a toggle — no
 * component changes, which is the whole point of the two-layer architecture.
 *
 * Deliberately dependency-free and framework-agnostic: packages/ui is consumed
 * by the Next.js app and by Storybook, and neither should have to agree on a
 * state library.
 */

export const THEMES = ["light"] as const;
export type Theme = (typeof THEMES)[number];

/** The only theme v2.0 specifies. */
export const DEFAULT_THEME: Theme = "light";

/**
 * Base page background per theme, as a literal colour.
 *
 * `<meta name="theme-color">` is consumed by the browser before any stylesheet
 * is parsed, so it cannot reference a CSS custom property. Exporting the value
 * here keeps ONE source of truth: it must stay equal to `--bg-base` in
 * tokens.css, and a test asserts exactly that.
 */
/* eslint-disable no-restricted-syntax -- justified: <meta name="theme-color"> is
   read before any stylesheet, so this value cannot be a CSS variable. The
   THEME_BASE_COLOR test asserts it stays equal to --bg-base in tokens.css. */
export const THEME_BASE_COLOR: Record<Theme, string> = {
  light: "#f7f5f1",
};
/* eslint-enable no-restricted-syntax */

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Read the theme currently applied to the document. */
export function getTheme(document: Document): Theme {
  const attribute = document.documentElement.dataset["theme"];
  return isTheme(attribute) ? attribute : DEFAULT_THEME;
}

/** Apply a theme to the document. */
export function setTheme(document: Document, theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
}
