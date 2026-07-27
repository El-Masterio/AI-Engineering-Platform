import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Button, StatusIndicator, type RunStatus } from "@atelier/ui";

export const metadata: Metadata = { title: "Projects" };

/**
 * Placeholder rows. Real project data arrives with the domain, database and API
 * milestones (M004, M015+); M009 needs only somewhere to navigate to.
 */
const PROJECTS: readonly { id: string; name: string; goal: string; status: RunStatus }[] = [
  {
    id: "inventory-system",
    name: "Inventory system",
    goal: "Stock tracking with supplier reconciliation.",
    status: "running",
  },
  {
    id: "billing-portal",
    name: "Billing portal",
    goal: "Self-serve invoices and payment methods.",
    status: "awaiting_approval",
  },
  {
    id: "internal-crm",
    name: "Internal CRM",
    goal: "Lead pipeline for the sales team.",
    status: "passed",
  },
];

export default function ProjectsPage() {
  return (
    <div className="mx-auto flex max-w-[var(--container-content)] flex-col gap-5">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[length:var(--text-2xl)] font-semibold tracking-[var(--tracking-tight)]">
            Projects
          </h1>
          <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">
            Each project has a plan you approve and agents that deliver against it.
          </p>
        </div>
        <Button>New project</Button>
      </header>

      <ul className="flex flex-col gap-2">
        {PROJECTS.map((project) => (
          <li key={project.id}>
            <Link
              href={{ pathname: "/projects/[projectId]", query: { projectId: project.id } }}
              className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 outline-none transition-colors duration-[--dur-instant] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[length:var(--text-sm)] font-medium">
                  {project.name}
                </span>
                <span className="truncate text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
                  {project.goal}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusIndicator status={project.status} />
                <Badge>3 milestones</Badge>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
