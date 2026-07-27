import Link from "next/link";
import { Button } from "@atelier/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-mono text-[length:var(--text-sm)] text-[var(--text-tertiary)]">404</p>
      <h1 className="text-[length:var(--text-xl)] font-semibold text-[var(--text-primary)]">
        Page not found
      </h1>
      <Button asChild variant="secondary">
        <Link href="/projects">Back to projects</Link>
      </Button>
    </main>
  );
}
