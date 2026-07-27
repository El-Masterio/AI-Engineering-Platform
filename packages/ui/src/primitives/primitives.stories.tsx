import type { Meta, StoryObj } from "@storybook/react-vite";
import { Rocket, Search } from "lucide-react";
import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { Card, StatCard } from "./card.js";
import { Checkbox } from "./checkbox.js";
import { Field } from "./field.js";
import { Icon } from "./icon.js";
import { Input } from "./input.js";
import { RUN_STATUSES, StatusIndicator } from "./status-indicator.js";
import { Switch } from "./switch.js";
import { Textarea } from "./textarea.js";
import { Avatar } from "./avatar.js";
import { Tooltip, TooltipProvider } from "./tooltip.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.js";

/** A single gallery story per §18 v2.0's component table. */
const meta = {
  title: "Primitives/Gallery",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-[var(--border-subtle)] py-8 last:border-b-0">
      <h3 className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)]">
        {label}
      </h3>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}

export const Gallery: Story = {
  render: () => (
    <TooltipProvider>
      <div className="min-h-dvh bg-[var(--bg-base)] px-8 py-8 text-[var(--text-primary)]">
        <div className="mx-auto max-w-[900px]">
          <Row label="Type scale">
            <div className="flex w-full flex-col gap-3">
              <span className="font-display text-[length:var(--text-h1)] font-extrabold tracking-[var(--tracking-tight)]">
                Manrope 52
              </span>
              <span className="font-display text-[length:var(--text-h3)] font-bold tracking-[var(--tracking-tight)]">
                Manrope 32
              </span>
              <span className="text-[length:var(--text-body)]">Inter 16 — body copy</span>
              <span className="text-[length:var(--text-small)] text-[var(--text-secondary)]">
                Inter 14 — secondary
              </span>
              <span className="font-mono text-[length:var(--text-caption)] text-[var(--text-tertiary)]">
                JetBrains Mono 13 — code
              </span>
            </div>
          </Row>
          <Row label="Card and KPI">
            <div className="grid w-full gap-6 sm:grid-cols-3">
              <StatCard label="Active projects" value="3" hint="1 awaiting approval" />
              <StatCard label="Runs this week" value="47" hint="94% passed" />
              <Card>
                <p className="text-[length:var(--text-small)] text-[var(--text-secondary)]">
                  A plain card: white, hairline border, 20px radius, a shadow you have to look for.
                </p>
              </Card>
            </div>
          </Row>
          <Row label="Button — variants">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </Row>
          <Row label="Button — sizes and states">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
          </Row>
          <Row label="StatusIndicator — every run state">
            {RUN_STATUSES.map((status) => (
              <StatusIndicator key={status} status={status} />
            ))}
          </Row>
          <Row label="Badge">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="sky">Secondary</Badge>
            <Badge tone="ok">Passed</Badge>
            <Badge tone="warn">Blocked</Badge>
            <Badge tone="err">Failed</Badge>
            <Badge tone="info">Info</Badge>
          </Row>
          <Row label="Icon — 1.75px stroke">
            <Icon icon={Rocket} size={16} label="Deploy" />
            <Icon icon={Rocket} size={20} label="Deploy" />
            <Icon icon={Search} size={24} label="Search" />
          </Row>
          <Row label="Avatar">
            <Avatar name="Ada Lovelace" size="sm" />
            <Avatar name="Ada Lovelace" size="md" />
            <Avatar name="Ada Lovelace" size="lg" />
            <Avatar name="Code Reviewer" kind="agent" size="md" />
          </Row>
          <Row label="Tooltip — supplementary only">
            <Tooltip content="Starts the milestone">
              <Button variant="secondary">Hover or focus me</Button>
            </Tooltip>
          </Row>
          <Row label="Select">
            <Select>
              <SelectTrigger aria-label="Model tier" className="w-72">
                <SelectValue placeholder="Choose a model tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reasoning">Reasoning</SelectItem>
                <SelectItem value="implementation">Implementation</SelectItem>
                <SelectItem value="utility">Utility</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Checkbox and Switch">
            <Checkbox aria-label="Include tests" defaultChecked />
            <Checkbox aria-label="Partially selected" checked="indeterminate" />
            <Checkbox aria-label="Disabled" disabled />
            <Switch aria-label="Auto-merge" defaultChecked />
            <Switch aria-label="Disabled switch" disabled />
          </Row>
          <Row label="Field — label, description, error, required">
            <div className="flex w-full flex-col gap-6">
              <Field label="Project name" description="Shown across the dashboard.">
                {(p) => <Input {...p} placeholder="atelier-web" />}
              </Field>
              <Field label="Budget (credits)" error="Must be greater than zero." required>
                {(p) => <Input {...p} type="number" defaultValue={0} />}
              </Field>
              <Field label="Goal" description="Describe what the agents should build.">
                {(p) => <Textarea {...p} placeholder="Build an inventory system…" />}
              </Field>
            </div>
          </Row>
        </div>
      </div>
    </TooltipProvider>
  ),
};
