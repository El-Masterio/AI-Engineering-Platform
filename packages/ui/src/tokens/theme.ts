/**
 * Runtime theme switching.
 *
 * The theme is an attribute on <html>, not a class and not a rebuild: every
 * semantic token is a CSS custom property, so flipping `data-theme` re-resolves
 * the whole design system in one paint (§18).
 *
 * Deliberately dependency-free and framework-agnostic — packages/ui may be
 * consumed by the Next.js app (M009) and by Storybook, and neither should have
 * to agree on a state library to change a theme.
 */

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/** Dark-first, per the §18 design direction. */
export const DEFAULT_THEME: Theme = "dark";

/**
 * Base page background per theme, as literal colour.
 *
 * `<meta name="theme-color">` is consumed by the browser before any stylesheet
 * is parsed, so it cannot reference a CSS custom property. Exporting the values
 * here keeps ONE source of truth: these must stay equal to `--bg-base` in
 * tokens.css, and a test asserts exactly that.
 */
/* eslint-disable no-restricted-syntax -- justified: <meta name="theme-color"> is
   read before any stylesheet, so these two values cannot be CSS variables. The
   THEME_BASE_COLOR test asserts they stay equal to --bg-base in tokens.css. */
export const THEME_BASE_COLOR: Record<Theme, string> = {
  dark: "#0d1116",
  light: "#f7f8f9",
};
/* eslint-enable no-restricted-syntax */

/** Key used for the persisted preference. */
export const THEME_STORAGE_KEY = "atelier-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Read the theme currently applied to the document. */
export function getTheme(document: Document): Theme {
  const attribute = document.documentElement.dataset["theme"];
  return isTheme(attribute) ? attribute : DEFAULT_THEME;
}

/**
 * Apply a theme and persist the choice.
 *
 * Storage is best-effort: private browsing and blocked storage must not break
 * theming, so a failure is swallowed rather than thrown.
 */
export function setTheme(document: Document, theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
  try {
    document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable — the attribute is applied regardless.
  }
}

export function toggleTheme(document: Document): Theme {
  const next: Theme = getTheme(document) === "dark" ? "light" : "dark";
  setTheme(document, next);
  return next;
}

/**
 * Resolve the theme to use on first paint: an explicit stored choice, else dark.
 *
 * The OS `prefers-color-scheme` is deliberately NOT consulted. §18 specifies a
 * dark-first product and §8 scopes the MVP to dark only; auto-switching to
 * light because the operating system says so would override that product
 * decision for most users. Light remains fully supported and one click away.
 *
 * Revisit at Phase 4, when light mode formally ships (M083).
 */
export function resolveInitialTheme(window_: Window): Theme {
  try {
    const stored = window_.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return DEFAULT_THEME;
}

/**
 * Blocking script for the document <head>, injected before first paint.
 *
 * Without this the page renders in the default theme and then corrects itself —
 * the "theme flash". It must run synchronously, so it ships as a string rather
 * than a module import.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)},s=localStorage.getItem(k);
document.documentElement.dataset.theme=(s==="dark"||s==="light")?s:${JSON.stringify(DEFAULT_THEME)};
}catch(e){document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME)};}})();`;
