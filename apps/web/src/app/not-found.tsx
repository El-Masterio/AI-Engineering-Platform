import Link from "next/link";
import { Button, Card } from "@atelier/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <Card padding="lg" className="flex max-w-[520px] flex-col items-center gap-6 text-center">
        <p className="font-mono text-[length:var(--text-small)] text-[var(--text-tertiary)]">404</p>
        <div className="flex flex-col gap-2">
          <h1 className="text-[length:var(--text-h4)]">Page not found</h1>
          <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
            That route does not exist. It may have moved, or the link may be stale.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </Card>
    </main>
  );
}
