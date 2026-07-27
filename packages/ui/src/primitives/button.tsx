import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/**
 * Button — §18 v2.0.
 *
 * Geometry is the directive's: 48px tall, 24px of horizontal padding, a 14px
 * radius, a 15px label. Variants and sizes come from tokens only; there is not
 * a single literal colour or size here, which is what let the entire palette be
 * replaced without touching this file's structure (and is enforced by lint).
 *
 * `primary` fills with --accent-bg rather than the brand orange. The brand
 * #f06d22 sits at 3.04:1 under white — below the 4.5:1 a 15px label requires.
 * See the header of tokens.css.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[var(--radius-md)] font-semibold select-none",
    "transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
    // Visible, non-colour-dependent focus (NFR-A11Y-4).
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-[var(--border-focus)]",
    // Disabled must be perceivable without relying on colour alone.
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--accent-bg)] text-[var(--accent-fg)]",
          "hover:bg-[var(--accent-bg-hover)] active:bg-[var(--accent-bg-active)]",
        ].join(" "),
        secondary: [
          "bg-[var(--bg-surface)] text-[var(--text-primary)]",
          "border border-[var(--border-default)]",
          "hover:bg-[var(--bg-base)] active:bg-[var(--bg-hover)]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[var(--text-secondary)]",
          "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        ].join(" "),
        danger: [
          "bg-[var(--status-err-fill)] text-[var(--text-inverse)]",
          "hover:brightness-95 active:brightness-90",
        ].join(" "),
      },
      size: {
        sm: "h-[var(--control-h-sm)] px-4 text-[length:var(--text-small)]",
        md: "h-[var(--control-h)] px-[var(--control-px)] text-[length:var(--text-button)]",
        lg: "h-[var(--control-h-lg)] px-8 text-[length:var(--text-body)]",
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
          className="size-4 animate-spin motion-reduce:animate-none"
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
