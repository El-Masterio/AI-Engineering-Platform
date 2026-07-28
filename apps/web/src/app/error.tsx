"use client";

import { useEffect } from "react";
import { Button, Card, Icon } from "@atelier/ui";
import { TriangleAlert } from "lucide-react";

/**
 * Root error boundary.
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
    <main className="flex min-h-dvh items-center justify-center p-8" data-testid="error-boundary">
      <Card padding="lg" className="flex max-w-[520px] flex-col items-center gap-6 text-center">
        <span className="grid size-14 place-items-center rounded-[var(--radius-md)] bg-[var(--status-err-bg)]">
          <Icon icon={TriangleAlert} size={24} label="Error" className="text-[var(--status-err)]" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[length:var(--text-h4)]">Something went wrong</h1>
          <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
            The page failed to render. The error has been recorded.
          </p>
          {error.digest === undefined ? null : (
            <p className="mt-2 font-mono text-[length:var(--text-caption)] text-[var(--text-tertiary)]">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <Button onClick={reset}>Try again</Button>
      </Card>
    </main>
  );
}
