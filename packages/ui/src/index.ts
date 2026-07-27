/**
 * Design system components built on design tokens.
 *
 * See docs/03-design/18-design-system.md.
 *
 * M007 delivers the token layer and theme switching. Components arrive at M008;
 * they must reference SEMANTIC tokens only — never a primitive, never a literal
 * colour (enforced by the no-hardcoded-colour rule in eslint.config.js).
 *
 * Stylesheets are not re-exported here; consumers import them directly:
 *   @import "@atelier/ui/theme.css";   // Tailwind bridge + tokens
 */

export const PACKAGE_NAME = "@atelier/ui" as const;

export {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEME_INIT_SCRIPT,
  isTheme,
  getTheme,
  setTheme,
  toggleTheme,
  resolveInitialTheme,
  type Theme,
} from "./tokens/theme.js";
