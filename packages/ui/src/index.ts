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

// ── Primitives (M008) ──────────────────────────────────────────────────────
export { Button, buttonVariants, type ButtonProps } from "./primitives/button.js";
export { Badge, badgeVariants, type BadgeProps } from "./primitives/badge.js";
export { Icon, type IconProps } from "./primitives/icon.js";
export {
  StatusIndicator,
  RUN_STATUSES,
  type RunStatus,
  type StatusIndicatorProps,
} from "./primitives/status-indicator.js";
export {
  Field,
  controlClasses,
  type FieldProps,
  type FieldControlProps,
} from "./primitives/field.js";
export { Input, type InputProps } from "./primitives/input.js";
export { Textarea, type TextareaProps } from "./primitives/textarea.js";
export { Checkbox, type CheckboxProps } from "./primitives/checkbox.js";
export { Switch, type SwitchProps } from "./primitives/switch.js";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectSeparator,
} from "./primitives/select.js";
export { Avatar, type AvatarProps } from "./primitives/avatar.js";
export {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  type TooltipProps,
} from "./primitives/tooltip.js";
export { cn } from "./lib/cn.js";

export {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEME_INIT_SCRIPT,
  THEME_BASE_COLOR,
  isTheme,
  getTheme,
  setTheme,
  toggleTheme,
  resolveInitialTheme,
  type Theme,
} from "./tokens/theme.js";
