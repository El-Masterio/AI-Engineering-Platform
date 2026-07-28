import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";
import { controlClasses } from "./field.js";

/**
 * Select — Radix supplies typeahead, arrow-key navigation, Home/End and the
 * listbox ARIA contract; we supply the appearance only.
 *
 * Exported as parts rather than a single monolith so callers can group and
 * separate options without us guessing at every shape.
 */
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        controlClasses,
        "flex h-[var(--control-h)] items-center justify-between gap-2 px-4",
        "text-[length:var(--text-body)]",
        "data-[placeholder]:text-[var(--text-placeholder)]",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          width={18}
          height={18}
          strokeWidth={1.75}
          aria-hidden="true"
          className="shrink-0 text-[var(--text-tertiary)]"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = "popper", ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          "z-[var(--z-dropdown)] min-w-40 overflow-hidden rounded-[var(--radius-md)] border",
          "border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)]",
          position === "popper" && "translate-y-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-2">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-[var(--radius-sm)]",
        "py-2 pl-3 pr-9 text-[length:var(--text-small)] text-[var(--text-primary)] outline-none",
        "data-[highlighted]:bg-[var(--bg-selected)] data-[highlighted]:text-[var(--secondary-soft-fg)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-3 flex items-center">
        <SelectPrimitive.ItemIndicator>
          <Check
            width={16}
            height={16}
            strokeWidth={2.5}
            aria-hidden="true"
            className="text-[var(--secondary-strong)]"
          />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
});

export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("my-2 h-px bg-[var(--border-subtle)]", className)}
      {...props}
    />
  );
});
