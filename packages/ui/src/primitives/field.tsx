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
    <div className={cn("flex flex-col gap-2", className)}>
      <LabelPrimitive.Root
        htmlFor={id}
        className={cn(
          "text-[length:var(--text-small)] font-medium text-[var(--text-primary)]",
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required ? (
          <span className="ml-1 text-[var(--status-err)]" aria-hidden="true">
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
        <p
          id={descriptionId}
          className="text-[length:var(--text-caption)] text-[var(--text-tertiary)]"
        >
          {description}
        </p>
      )}

      {hasError ? (
        <p
          id={errorId}
          className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--status-err)]"
        >
          <CircleAlert width={14} height={14} strokeWidth={1.75} aria-hidden="true" />
          {error}
        </p>
      ) : undefined}
    </div>
  );
}

/**
 * Shared control chrome so Input, Textarea and Select look like one family.
 *
 * The border is --border-default, not the directive's #d3d9e2. An input's
 * outline is the only thing identifying it as a control against a white card,
 * which makes it subject to WCAG 1.4.11's 3:1 floor; #d3d9e2 measures 1.42:1.
 * It stays 1px and quiet — just dark enough to exist.
 */
export const controlClasses = [
  "w-full rounded-[var(--radius-control)] border bg-[var(--bg-inset)]",
  "text-[var(--text-primary)] border-[var(--border-default)]",
  "placeholder:text-[var(--text-placeholder)]",
  "transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
  "hover:border-[var(--border-strong)]",
  "focus-visible:border-[var(--border-focus)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-[var(--status-err)]",
].join(" ");
