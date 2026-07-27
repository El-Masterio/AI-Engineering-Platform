import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

export type CheckboxProps = ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>;

/**
 * Checkbox — for deferred submission (§18); use Switch for immediate effect.
 * Radix supplies roving focus, space-key toggling and the mixed/indeterminate
 * ARIA state; we supply only the appearance.
 */
export const Checkbox = forwardRef<ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
          "peer size-5 shrink-0 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-inset)]",
          "transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=checked]:border-transparent data-[state=checked]:bg-[var(--accent-bg)]",
          "data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-[var(--accent-bg)]",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[var(--accent-fg)]">
          {props.checked === "indeterminate" ? (
            <Minus width={14} height={14} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Check width={14} height={14} strokeWidth={2.5} aria-hidden="true" />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  },
);
