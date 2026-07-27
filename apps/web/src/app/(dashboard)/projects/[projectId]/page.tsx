import type { Metadata } from "next";
import { Badge, Button, Card, StatCard, StatusIndicator } from "@atelier/ui";
import { PageHeader } from "@/components/page-header";

type Params = { projectId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { projectId } = await params;
  return { title: projectId };
}

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={projectId}
        description="The milestone board, run timeline and cost panel land with the orchestration milestones (M037–M050). This route exists so navigation and the shell are verifiable now."
        actions={
          <>
            <Button variant="secondary">Settings</Button>
            <Button>Run agents</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusIndicator status="running" />
        <Badge tone="sky">Milestone 2 of 3</Badge>
        <Badge tone="neutral">Backend Engineer active</Badge>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Milestones done" value="2" hint="of 3 planned" />
        <StatCard label="Runs" value="18" hint="16 passed review" />
        <StatCard label="Open reviews" value="1" hint="waiting on you" />
        <StatCard label="Spend" value="$84" hint="this milestone" />
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[length:var(--text-h5)]">Activity</h2>
        <p className="text-[length:var(--text-small)] text-[var(--text-secondary)]">
          The run timeline renders here once the orchestrator can produce one.
        </p>
      </Card>
    </div>
  );
}
