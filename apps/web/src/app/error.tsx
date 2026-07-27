"use client";

import { useEffect } from "react";
import { Button, Icon } from "@atelier/ui";
import { TriangleAlert } from "lucide-react";

/**
 * Root error boundary (M009 acceptance: "error boundary catches a thrown error").
 *
 * Shows the digest rather than the raw message: §16 requires that a
 * user-visible error never leaks internals, and the digest is what support
 * correlates against the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console -- justified: the structured logger and OTel arrive at M006; until then losing the error entirely is worse than a console call.
    console.error(error);
  }, [error]);

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="error-boundary"
    >
      <Icon icon={TriangleAlert} size={24} label="Error" className="text-[var(--status-err)]" />
      <div className="flex flex-col gap-1">
        <h1 className="text-[length:var(--text-xl)] font-semibold text-[var(--text-primary)]">
          Something went wrong
        </h1>
        <p className="max-w-prose text-[length:var(--text-sm)] text-[var(--text-secondary)]">
          The page failed to render. The error has been recorded.
        </p>
        {error.digest === undefined ? null : (
          <p className="mt-2 font-mono text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
            Reference: {error.digest}
          </p>
        )}
      </div>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
