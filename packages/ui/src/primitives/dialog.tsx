import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

/**
 * Dialog — §18 v2.0 Feedback.
 *
 * Radix supplies the parts that are easy to get wrong: focus trap, focus
 * restoration on close, Escape handling, `aria-modal`, and marking the rest of
 * the page inert. We supply appearance only.
 *
 * The overlay is a plain scrim rather than a blur — §18 rules out
 * glassmorphism, and a blurred backdrop makes text behind it unreadable
 * without making the dialog any clearer.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-[var(--z-overlay)] bg-[var(--bg-overlay)]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
});

export type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Hide the corner close button — only for dialogs with their own dismissal. */
  hideClose?: boolean;
  /** Align to the top of the viewport rather than centring. For palettes. */
  align?: "center" | "top";
};

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, hideClose = false, align = "center", ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 z-[var(--z-modal)] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2",
          "rounded-[var(--radius-lg)] border border-[var(--border-subtle)]",
          "bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]",
          "outline-none",
          align === "top" ? "top-24" : "top-1/2 -translate-y-1/2",
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              "absolute right-4 top-4 grid size-8 place-items-center rounded-[var(--radius-sm)]",
              "text-[var(--text-tertiary)] transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
              "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
            )}
          >
            <X width={18} height={18} strokeWidth={1.75} aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
