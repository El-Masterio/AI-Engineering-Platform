import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Rocket } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge.js";
import { Icon } from "./icon.js";
import { Avatar } from "./avatar.js";
import { Tooltip, TooltipProvider } from "./tooltip.js";
import { Button } from "./button.js";
import { RUN_STATUSES, StatusIndicator } from "./status-indicator.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.js";

describe("Badge", () => {
  it("renders text for every tone", () => {
    const tones = ["neutral", "accent", "ok", "warn", "err", "info"] as const;
    for (const tone of tones) {
      const { unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      expect(screen.getByText(tone)).toBeInTheDocument();
      unmount();
    }
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Badge tone="ok">Passed</Badge>);
    await expect(container).toHaveNoA11yViolations();
  });
});

describe("Icon", () => {
  it("is hidden from assistive tech when decorative", () => {
    const { container } = render(<Icon icon={Rocket} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is exposed as an image with a name when labelled", () => {
    render(<Icon icon={Rocket} label="Deploy" />);
    expect(screen.getByRole("img", { name: "Deploy" })).toBeInTheDocument();
  });
});

describe("StatusIndicator", () => {
  it("renders an accessible label for every status — never colour alone", () => {
    for (const status of RUN_STATUSES) {
      const { container, unmount } = render(<StatusIndicator status={status} />);
      // A text label is always present, so meaning survives without colour.
      expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      // And an icon accompanies it, so it survives without text styling too.
      expect(container.querySelector("svg")).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the label available to screen readers when icon-only", () => {
    render(<StatusIndicator status="running" iconOnly />);
    expect(screen.getByText("Running")).toHaveClass("sr-only");
  });

  it("exposes the status as a data attribute for styling and tests", () => {
    const { container } = render(<StatusIndicator status="failed" />);
    expect(container.querySelector('[data-status="failed"]')).toBeInTheDocument();
  });

  it("has no accessibility violations across all statuses", async () => {
    const { container } = render(
      <>
        {RUN_STATUSES.map((s) => (
          <StatusIndicator key={s} status={s} />
        ))}
      </>,
    );
    await expect(container).toHaveNoA11yViolations();
  });
});

describe("Avatar", () => {
  it("falls back to initials for a user", () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveTextContent("AL");
  });

  it("uses a role glyph for an agent rather than a fake face", () => {
    render(<Avatar name="Code Reviewer" kind="agent" />);
    const glyph = screen.getByRole("img", { name: "Code Reviewer" });
    expect(glyph.tagName.toLowerCase()).toBe("svg");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Avatar name="Ada Lovelace" />);
    await expect(container).toHaveNoA11yViolations();
  });
});

describe("Tooltip", () => {
  it("is reachable by keyboard focus and announced", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip content="Runs the milestone">
          <Button>Start</Button>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Start" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Runs the milestone");
  });
});

describe("Select", () => {
  it("opens with the keyboard and selects an option", async () => {
    const user = userEvent.setup();
    render(
      <Select>
        <SelectTrigger aria-label="Model tier">
          <SelectValue placeholder="Choose a tier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="reasoning">Reasoning</SelectItem>
          <SelectItem value="implementation">Implementation</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Model tier" });
    expect(trigger).toHaveTextContent("Choose a tier");

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    const option = await screen.findByRole("option", { name: "Implementation" });
    await user.click(option);
    expect(trigger).toHaveTextContent("Implementation");
  });

  it("has no accessibility violations when closed", async () => {
    const { container } = render(
      <Select>
        <SelectTrigger aria-label="Model tier">
          <SelectValue placeholder="Choose a tier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    await expect(container).toHaveNoA11yViolations();
  });
});
