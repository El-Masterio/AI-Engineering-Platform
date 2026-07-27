import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/**
 * Badge — status and metadata (§18).
 *
 * Tone changes colour, never meaning: the text inside is always the real
 * signal, so the component still reads correctly in monochrome (NFR-A11Y-5).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--text-xs)] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:
          "border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
        accent: "border-transparent bg-[var(--accent-bg)] text-[var(--accent-fg)]",
        ok: "border-transparent bg-[var(--bg-surface-2)] text-[var(--status-ok)]",
        warn: "border-transparent bg-[var(--bg-surface-2)] text-[var(--status-warn)]",
        err: "border-transparent bg-[var(--bg-surface-2)] text-[var(--status-err)]",
        info: "border-transparent bg-[var(--bg-surface-2)] text-[var(--status-info)]",
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
