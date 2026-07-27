import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/**
 * Badge — status and metadata (§18 v2.0).
 *
 * Tone changes colour, never meaning: the text inside is always the real
 * signal, so the component still reads correctly in monochrome (NFR-A11Y-5).
 *
 * Each tone pairs a tinted background with its own darkened foreground rather
 * than borrowing the page's. A chip is a small target on a coloured field,
 * which is exactly where a merely-decorative status colour becomes unreadable.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-[var(--radius-full)]",
    "px-3 py-1 text-[length:var(--text-caption)] font-medium",
    "whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral: "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
        accent: "bg-[var(--accent-soft-bg)] text-[var(--accent-soft-fg)]",
        sky: "bg-[var(--secondary-soft-bg)] text-[var(--secondary-soft-fg)]",
        ok: "bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
        warn: "bg-[var(--status-warn-bg)] text-[var(--status-warn)]",
        err: "bg-[var(--status-err-bg)] text-[var(--status-err)]",
        info: "bg-[var(--status-info-bg)] text-[var(--status-info)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { children: ReactNode };

export function Badge({ className, tone, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {children}
    </span>
  );
}

export { badgeVariants };
