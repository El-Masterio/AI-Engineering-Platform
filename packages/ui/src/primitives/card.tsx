import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/**
 * Card — the container the whole v2.0 interface is built from (§18).
 *
 * White fill, a hairline warm border, a 20px radius, 24px of padding, and a
 * shadow that is nearly invisible. The directive is explicit that shadows
 * "should almost disappear": the border does the separating, and the shadow
 * only lifts the card off the warm background by a hair.
 *
 * `interactive` is for cards that are themselves links or buttons. It does not
 * add a shadow on hover — raising a card on hover is the kind of motion the
 * directive rules out as decoration.
 */
const cardVariants = cva(
  [
    "rounded-[var(--radius-lg)] border border-[var(--border-subtle)]",
    "bg-[var(--bg-surface)] shadow-[var(--shadow-md)]",
  ].join(" "),
  {
    variants: {
      padding: {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
      interactive: {
        true: [
          "block transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
          "hover:border-[var(--border-muted)] hover:bg-[var(--bg-elevated)]",
        ].join(" "),
        false: "",
      },
    },
    defaultVariants: { padding: "md", interactive: false },
  },
);

export type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants> & { children: ReactNode };

export function Card({ className, padding, interactive, children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ padding, interactive }), className)} {...props}>
      {children}
    </div>
  );
}

export type StatCardProps = {
  label: string;
  value: string;
  /** Short qualifier under the value — a delta, a period, a unit. */
  hint?: string;
  className?: string;
};

/**
 * StatCard — the "large KPI card" the dashboard section of §18 calls for.
 *
 * The value is set in the display face at 40px. Deliberately no sparkline, no
 * icon and no coloured delta arrow: "Can anything be removed?" is a question
 * the directive asks of every component, and a KPI answers it by being a
 * number with a name.
 */
export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <span className="text-[length:var(--text-small)] font-medium text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="font-display text-[length:var(--text-h2)] font-bold leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
        {value}
      </span>
      {hint === undefined ? null : (
        <span className="text-[length:var(--text-caption)] text-[var(--text-tertiary)]">
          {hint}
        </span>
      )}
    </Card>
  );
}

export { cardVariants };
