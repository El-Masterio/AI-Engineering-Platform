import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * Without twMerge, `cn("p-2", "p-4")` emits both and the winner depends on
 * stylesheet order — which makes a `className` prop unreliable for callers.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
