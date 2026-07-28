import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";
import { controlClasses } from "./field.js";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlClasses, "resize-y px-4 py-3 text-[length:var(--text-body)]", className)}
      {...props}
    />
  );
});
