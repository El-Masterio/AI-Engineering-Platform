import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";
import { controlClasses } from "./field.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Input — pair with `Field` for the label, description and error.
 * Used bare only when an adjacent visible label already names it.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(controlClasses, "h-8 px-2.5 text-[length:var(--text-sm)]", className)}
      {...props}
    />
  );
});
