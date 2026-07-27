import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      role="status"
      aria-live="polite"
      data-testid="route-loading"
    >
      <Loader2
        width={20}
        height={20}
        strokeWidth={1.5}
        aria-hidden="true"
        className="animate-spin text-[var(--text-tertiary)] motion-reduce:animate-none"
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}
