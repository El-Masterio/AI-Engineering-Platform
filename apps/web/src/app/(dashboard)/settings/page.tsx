import type { Metadata } from "next";
import { Button, Card, Field, Input, Switch } from "@atelier/ui";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex max-w-[820px] flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Organization preferences. Persistence arrives with the API (M016)."
      />

      <Card className="flex flex-col gap-6">
        <Field label="Organization name" description="Shown across the dashboard.">
          {(p) => <Input {...p} defaultValue="Atelier Studio" />}
        </Field>

        <hr className="border-0 border-t border-[var(--border-subtle)]" />

        <div className="flex items-start justify-between gap-8">
          <div className="flex flex-col gap-1">
            <span className="text-[length:var(--text-body)] font-medium">
              Require approval before merge
            </span>
            <span className="text-[length:var(--text-small)] text-[var(--text-tertiary)]">
              Autonomy level L0. Production deploys always require approval and cannot be disabled.
            </span>
          </div>
          <Switch aria-label="Require approval before merge" defaultChecked />
        </div>

        <hr className="border-0 border-t border-[var(--border-subtle)]" />

        <div className="flex items-start justify-between gap-8">
          <div className="flex flex-col gap-1">
            <span className="text-[length:var(--text-body)] font-medium">
              Email me when a run needs review
            </span>
            <span className="text-[length:var(--text-small)] text-[var(--text-tertiary)]">
              One message per run, never a digest — a blocked agent is waiting on you.
            </span>
          </div>
          <Switch aria-label="Email me when a run needs review" />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost">Discard</Button>
          <Button>Save changes</Button>
        </div>
      </Card>
    </div>
  );
}
