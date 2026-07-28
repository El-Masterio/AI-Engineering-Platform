import { type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * Icon — one family (Lucide), fixed sizes, 1.75px stroke (§18 v2.0).
 *
 * Decorative icons are `aria-hidden`; a meaningful icon must carry a `label`,
 * which becomes its accessible name. There is deliberately no third option —
 * an unlabelled meaningful icon is the classic "mystery meat" defect §18 bans.
 */
export type IconProps = {
  icon: LucideIcon;
  size?: 16 | 20 | 24;
  /** Accessible name. Omit for purely decorative icons. */
  label?: string;
  className?: string;
};

export function Icon({ icon: LucideComponent, size = 16, label, className }: IconProps) {
  const isDecorative = label === undefined;
  return (
    <LucideComponent
      width={size}
      height={size}
      strokeWidth={1.75}
      className={cn("shrink-0", className)}
      aria-hidden={isDecorative ? "true" : undefined}
      role={isDecorative ? undefined : "img"}
      aria-label={label}
      focusable="false"
    />
  );
}
