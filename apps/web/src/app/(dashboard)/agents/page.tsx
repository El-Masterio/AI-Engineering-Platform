import type { Metadata } from "next";
import { Avatar, Badge, Card } from "@atelier/ui";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Agents" };

/** The six MVP roles from §13. Definitions become data at M024. */
const AGENTS = [
  { name: "Director", remit: "Plans milestones and assigns work", writes: false },
  { name: "Software Architect", remit: "Component design and ADRs", writes: false },
  { name: "Backend Engineer", remit: "Services, APIs, business logic", writes: true },
  { name: "Frontend Engineer", remit: "UI implementation", writes: true },
  { name: "Code Reviewer", remit: "Independent review, never its own work", writes: false },
  { name: "QA Engineer", remit: "Writes and runs tests", writes: true },
] as const;

export default function AgentsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Agents"
        description="The six MVP roles. Each runs with a bounded tool allowlist, and no agent reviews its own work."
      />

      <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((agent) => (
          <li key={agent.name} className="flex">
            <Card className="flex flex-1 flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <Avatar name={agent.name} kind="agent" size="lg" />
                <Badge tone={agent.writes ? "accent" : "neutral"}>
                  {agent.writes ? "Writes code" : "Read-only"}
                </Badge>
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-[length:var(--text-h5)]">{agent.name}</h2>
                <p className="text-[length:var(--text-small)] text-[var(--text-secondary)]">
                  {agent.remit}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
