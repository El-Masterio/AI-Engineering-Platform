import type { Metadata } from "next";
import { Badge, StatusIndicator } from "@atelier/ui";

type Params = { projectId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { projectId } = await params;
  return { title: projectId };
}

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params;

  return (
    <div className="mx-auto flex max-w-[var(--container-content)] flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-mono text-[length:var(--text-2xl)] font-semibold tracking-[var(--tracking-tight)]">
          {projectId}
        </h1>
        <div className="flex items-center gap-3">
          <StatusIndicator status="running" />
          <Badge tone="info">Milestone 2 of 3</Badge>
        </div>
      </header>
      <p className="max-w-[var(--container-prose)] text-[length:var(--text-sm)] text-[var(--text-secondary)]">
        The milestone board, run timeline and cost panel land with the orchestration milestones
        (M037-M050). This route exists so navigation and the shell are verifiable now.
      </p>
    </div>
  );
}
