import type { Metadata } from "next";
import { Field, Input, Switch } from "@atelier/ui";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-[var(--container-prose)] flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-[length:var(--text-2xl)] font-semibold tracking-[var(--tracking-tight)]">
          Settings
        </h1>
        <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">
          Organization preferences. Persistence arrives with the API (M016).
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <Field label="Organization name" description="Shown across the dashboard.">
          {(p) => <Input {...p} defaultValue="Atelier" />}
        </Field>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[length:var(--text-sm)]">Require approval before merge</span>
            <span className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
              Autonomy level L0. Production deploys always require approval and cannot be disabled.
            </span>
          </div>
          <Switch aria-label="Require approval before merge" defaultChecked />
        </div>
      </div>
    </div>
  );
}
