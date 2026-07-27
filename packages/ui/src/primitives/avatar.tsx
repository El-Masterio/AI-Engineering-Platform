import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Bot } from "lucide-react";
import { cn } from "../lib/cn.js";

export type AvatarProps = {
  /** Image URL. Falls back to initials, then to a role glyph. */
  src?: string;
  /** Used for the alt text and to derive initials. */
  name: string;
  /** Agents get a role glyph, never a fake human face (§18). */
  kind?: "user" | "agent";
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "size-7 text-[length:var(--text-caption)]",
  md: "size-9 text-[length:var(--text-small)]",
  lg: "size-12 text-[length:var(--text-body)]",
} as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ src, name, kind = "user", size = "md", className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full",
        "bg-[var(--secondary-soft-bg)] border border-[var(--border-subtle)]",
        SIZES[size],
        className,
      )}
    >
      {src === undefined ? undefined : (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      )}
      <AvatarPrimitive.Fallback
        // Omitted entirely (not 0) renders immediately: Radix initialises its
        // internal canRender flag to `delayMs === undefined`, so 0 still costs a
        // tick. Spread rather than pass undefined — exactOptionalPropertyTypes
        // treats an explicit undefined as a type error.
        {...(src === undefined ? {} : { delayMs: 300 })}
        className="flex size-full items-center justify-center font-semibold text-[var(--secondary-soft-fg)]"
      >
        {kind === "agent" ? (
          <Bot width={18} height={18} strokeWidth={1.75} aria-label={name} role="img" />
        ) : (
          <span aria-label={name} role="img">
            {initials(name)}
          </span>
        )}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
