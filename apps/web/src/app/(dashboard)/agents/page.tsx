import type { Metadata } from "next";
import { Avatar, Badge } from "@atelier/ui";

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
    <div className="mx-auto flex max-w-[var(--container-content)] flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-[length:var(--text-2xl)] font-semibold tracking-[var(--tracking-tight)]">
          Agents
        </h1>
        <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">
          The six MVP roles. Each has a bounded tool allowlist.
        </p>
      </header>
      <ul className="flex flex-col gap-2">
        {AGENTS.map((agent) => (
          <li
            key={agent.name}
            className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3"
          >
            <Avatar name={agent.name} kind="agent" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[length:var(--text-sm)] font-medium">{agent.name}</span>
              <span className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
                {agent.remit}
              </span>
            </div>
            <Badge tone={agent.writes ? "accent" : "neutral"}>
              {agent.writes ? "writes code" : "read-only"}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
