import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

/**
 * Switch — for settings that take effect immediately (§18).
 * If the change needs a save step, use Checkbox instead.
 */
export const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  function Switch({ className, ...props }, ref) {
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent",
          "transition-colors duration-[--dur-fast] ease-[--ease-out]",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=unchecked]:bg-[var(--bg-surface-2)] data-[state=unchecked]:border-[var(--border-default)]",
          "data-[state=checked]:bg-[var(--accent-bg)]",
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "pointer-events-none block size-5 rounded-full bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]",
            "transition-transform duration-[--dur-fast] ease-[--ease-out] motion-reduce:transition-none",
            "data-[state=unchecked]:translate-x-0.5",
            "data-[state=checked]:translate-x-[1.375rem]",
          )}
        />
      </SwitchPrimitive.Root>
    );
  },
);
