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
 * Resolve the theme to use on first paint: stored preference, else the OS
 * preference, else dark.
 */
export function resolveInitialTheme(window_: Window): Theme {
  try {
    const stored = window_.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Ignore and fall through to the OS preference.
  }
  return window_.matchMedia("(prefers-color-scheme: light)").matches ? "light" : DEFAULT_THEME;
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
var t=(s==="dark"||s==="light")?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
document.documentElement.dataset.theme=t;
}catch(e){document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME)};}})();`;
