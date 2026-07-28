import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/**
 * Tooltip — SUPPLEMENTARY ONLY (§18). Never the sole carrier of information:
 * a tooltip is unavailable to touch users and easy to miss, so anything
 * required to operate the UI must also be visible or in the accessible name.
 */
export const TooltipProvider = TooltipPrimitive.Provider;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-[var(--z-tooltip)] max-w-64 rounded-[var(--radius-sm)] border px-3 py-2",
          "border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)]",
          "text-[length:var(--text-caption)] text-[var(--text-primary)]",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
};

/** Convenience wrapper for the common single-trigger case. */
export function Tooltip({ content, children, side = "top", delayDuration = 200 }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipPrimitive.Root>
  );
}
