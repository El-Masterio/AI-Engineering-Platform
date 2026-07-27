import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Button, Card, StatCard, StatusIndicator, type RunStatus } from "@atelier/ui";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Projects" };

/**
 * Placeholder rows. Real project data arrives with the domain, database and API
 * milestones (M004, M015+); the shell needs only somewhere to navigate to.
 */
const PROJECTS: readonly {
  id: string;
  name: string;
  goal: string;
  status: RunStatus;
  milestones: string;
}[] = [
  {
    id: "inventory-system",
    name: "Inventory system",
    goal: "Stock tracking with supplier reconciliation.",
    status: "running",
    milestones: "2 of 3 milestones",
  },
  {
    id: "billing-portal",
    name: "Billing portal",
    goal: "Self-serve invoices and payment methods.",
    status: "awaiting_approval",
    milestones: "1 of 4 milestones",
  },
  {
    id: "internal-crm",
    name: "Internal CRM",
    goal: "Lead pipeline for the sales team.",
    status: "passed",
    milestones: "5 of 5 milestones",
  },
];

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Projects"
        description="Each project has a plan you approve and agents that deliver against it."
        actions={<Button>New project</Button>}
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Active projects" value="3" hint="1 awaiting your approval" />
        <StatCard label="Runs this week" value="47" hint="94% passed review" />
        <StatCard label="Spend this month" value="$312" hint="of a $1,000 budget" />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-[length:var(--text-h5)]">All projects</h2>
        <ul className="grid gap-6 lg:grid-cols-2">
          {PROJECTS.map((project) => (
            <li key={project.id} className="flex">
              <Card interactive className="flex-1 p-0">
                <Link
                  href={{ pathname: "/projects/[projectId]", query: { projectId: project.id } }}
                  className="flex h-full flex-col gap-4 rounded-[var(--radius-lg)] p-6 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="truncate font-display text-[length:var(--text-h5)] font-bold tracking-[var(--tracking-tight)]">
                      {project.name}
                    </span>
                    <StatusIndicator status={project.status} />
                  </div>
                  <p className="flex-1 text-[length:var(--text-small)] text-[var(--text-secondary)]">
                    {project.goal}
                  </p>
                  <Badge tone="neutral" className="self-start">
                    {project.milestones}
                  </Badge>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
