import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/**
 * Button — §18 primitives.
 *
 * Variants and sizes come from the design tokens only; there is not a single
 * literal colour or size here, which is what lets both themes work from one
 * definition (and is enforced by lint).
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md font-medium select-none",
    "transition-colors duration-[--dur-instant] ease-[--ease-out]",
    // Visible, non-colour-dependent focus (NFR-A11Y-4).
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-[var(--border-focus)]",
    // Disabled must be perceivable without relying on colour alone.
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent-bg)] text-[var(--accent-fg)] hover:bg-[var(--accent-bg-hover)] active:brightness-95",
        secondary:
          "bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] active:brightness-95",
        ghost:
          "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:brightness-95",
        danger:
          "bg-[var(--status-err)] text-[var(--text-inverse)] hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-7 px-2.5 text-[length:var(--text-xs)]",
        md: "h-8 px-3 text-[length:var(--text-sm)]",
        lg: "h-10 px-4 text-[length:var(--text-base)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element (e.g. an anchor) instead of a `<button>`. */
    asChild?: boolean;
    /** Shows a spinner and blocks interaction. Implies `disabled`. */
    loading?: boolean;
    /** Required when the button has no visible text, so it is never unlabelled. */
    "aria-label"?: string;
    children?: ReactNode;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
  ref,
) {
  const Component = asChild ? Slot : "button";
  const isDisabled = disabled === true || loading;

  return (
    <Component
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isDisabled}
      // Announce the pending state rather than leaving assistive tech to infer
      // it from a spinner it cannot see.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2
          className="size-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
          data-testid="button-spinner"
        />
      ) : null}
      {/* Slottable keeps `asChild` working while the spinner is a sibling —
          Slot otherwise sees two children and refuses to merge. */}
      <Slottable>{children}</Slottable>
    </Component>
  );
});

export { buttonVariants };
