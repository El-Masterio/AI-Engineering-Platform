import * as LabelPrimitive from "@radix-ui/react-label";
import { CircleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.js";

/**
 * Field — the label/description/error wrapper every form control shares.
 *
 * §18: "Label always visible — never placeholder-as-label", and error state
 * pairs colour with an icon and text. Centralising that here means no control
 * can accidentally ship without it.
 *
 * Returns wiring (ids, aria-describedby, aria-invalid) via a render prop so the
 * control stays a plain input rather than being wrapped in extra DOM.
 */
export type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

export type FieldProps = {
  label: string;
  /** Visually hide the label. It remains the accessible name. */
  labelHidden?: boolean;
  description?: string;
  /** Presence marks the field invalid and renders the message. */
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
};

export function Field({
  label,
  labelHidden = false,
  description,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const hasError = error !== undefined && error !== "";

  const describedBy =
    [description === undefined ? undefined : descriptionId, hasError ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <LabelPrimitive.Root
        htmlFor={id}
        className={cn(
          "text-[length:var(--text-xs)] font-medium text-[var(--text-secondary)]",
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--status-err)]" aria-hidden="true">
            *
          </span>
        ) : undefined}
      </LabelPrimitive.Root>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": hasError ? true : undefined,
      })}

      {description === undefined ? null : (
        <p id={descriptionId} className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
          {description}
        </p>
      )}

      {hasError ? (
        <p
          id={errorId}
          className="flex items-center gap-1 text-[length:var(--text-xs)] text-[var(--status-err)]"
        >
          <CircleAlert width={12} height={12} strokeWidth={1.5} aria-hidden="true" />
          {error}
        </p>
      ) : undefined}
    </div>
  );
}

/** Shared control chrome so Input, Textarea and Select look like one family. */
export const controlClasses = [
  "w-full rounded-md border bg-[var(--bg-inset)] text-[var(--text-primary)]",
  "border-[var(--border-default)]",
  "placeholder:text-[var(--text-tertiary)]",
  "transition-colors duration-[--dur-instant]",
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-[var(--status-err)]",
].join(" ");
