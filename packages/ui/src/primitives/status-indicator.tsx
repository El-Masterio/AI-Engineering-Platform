import {
  CircleDashed,
  CircleDot,
  CircleSlash,
  CircleX,
  CircleCheck,
  Hand,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { type HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

/**
 * StatusIndicator — "the single most-used component" (§18).
 *
 * Every state carries an ICON and a TEXT LABEL as well as a colour, because
 * NFR-A11Y-5 forbids meaning conveyed by colour alone — and because run status
 * is the thing users scan for most often. Colour is the fastest signal for
 * people who can use it, and the redundant icon + label mean everyone else
 * loses nothing.
 */
export const RUN_STATUSES = [
  "queued",
  "running",
  "blocked",
  "awaiting_approval",
  "passed",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

type StatusSpec = { label: string; icon: LucideIcon; className: string; spin?: boolean };

const STATUS: Record<RunStatus, StatusSpec> = {
  queued: { label: "Queued", icon: CircleDashed, className: "text-[var(--text-tertiary)]" },
  running: {
    label: "Running",
    icon: Loader2,
    className: "text-[var(--status-running)]",
    spin: true,
  },
  blocked: { label: "Blocked", icon: CircleSlash, className: "text-[var(--status-warn)]" },
  awaiting_approval: {
    label: "Awaiting approval",
    icon: Hand,
    className: "text-[var(--status-info)]",
  },
  passed: { label: "Passed", icon: CircleCheck, className: "text-[var(--status-ok)]" },
  failed: { label: "Failed", icon: CircleX, className: "text-[var(--status-err)]" },
  cancelled: { label: "Cancelled", icon: CircleDot, className: "text-[var(--text-tertiary)]" },
};

export type StatusIndicatorProps = HTMLAttributes<HTMLSpanElement> & {
  status: RunStatus;
  /** Hide the text label. The accessible name is preserved either way. */
  iconOnly?: boolean;
  /** Override the displayed text (the accessible name follows it). */
  label?: string;
};

export function StatusIndicator({
  status,
  iconOnly = false,
  label,
  className,
  ...props
}: StatusIndicatorProps) {
  const spec = STATUS[status];
  const text = label ?? spec.label;
  const IconComponent = spec.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[length:var(--text-xs)] font-medium",
        spec.className,
        className,
      )}
      data-status={status}
      {...props}
    >
      <IconComponent
        width={14}
        height={14}
        strokeWidth={1.5}
        aria-hidden="true"
        className={cn("shrink-0", spec.spin === true && "animate-spin motion-reduce:animate-none")}
      />
      {iconOnly ? <span className="sr-only">{text}</span> : <span>{text}</span>}
    </span>
  );
}
