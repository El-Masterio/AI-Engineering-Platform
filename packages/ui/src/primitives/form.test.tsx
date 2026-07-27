import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./field.js";
import { Input } from "./input.js";
import { Textarea } from "./textarea.js";
import { Checkbox } from "./checkbox.js";
import { Switch } from "./switch.js";

describe("Field", () => {
  it("associates the label with the control", () => {
    render(<Field label="Project name">{(p) => <Input {...p} />}</Field>);
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
  });

  it("keeps the accessible name when the label is visually hidden", () => {
    render(
      <Field label="Search" labelHidden>
        {(p) => <Input {...p} />}
      </Field>,
    );
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("exposes the description via aria-describedby", () => {
    render(
      <Field label="Slug" description="Lowercase, no spaces.">
        {(p) => <Input {...p} />}
      </Field>,
    );
    expect(screen.getByLabelText("Slug")).toHaveAccessibleDescription("Lowercase, no spaces.");
  });

  it("marks the control invalid and describes the error", () => {
    render(
      <Field label="Budget" error="Must be greater than zero.">
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText("Budget");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Must be greater than zero/);
  });

  it("has no accessibility violations across its states", async () => {
    const { container } = render(
      <>
        <Field label="Name">{(p) => <Input {...p} />}</Field>
        <Field label="Notes" description="Optional.">
          {(p) => <Textarea {...p} />}
        </Field>
        <Field label="Budget" error="Required." required>
          {(p) => <Input {...p} />}
        </Field>
      </>,
    );
    await expect(container).toHaveNoA11yViolations();
  });
});

describe("Input", () => {
  it("accepts typing and can be disabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Input aria-label="Goal" />);
    await user.type(screen.getByLabelText("Goal"), "ship it");
    expect(screen.getByLabelText("Goal")).toHaveValue("ship it");

    rerender(<Input aria-label="Goal" disabled />);
    expect(screen.getByLabelText("Goal")).toBeDisabled();
  });
});

describe("Textarea", () => {
  it("accepts multiline input", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Description" />);
    await user.type(screen.getByLabelText("Description"), "line one{Enter}line two");
    expect(screen.getByLabelText("Description")).toHaveValue("line one\nline two");
  });
});

describe("Checkbox", () => {
  it("toggles with the keyboard", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox aria-label="Include tests" onCheckedChange={onCheckedChange} />);

    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Include tests" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("exposes the indeterminate state as aria-checked=mixed", () => {
    render(<Checkbox aria-label="All" checked="indeterminate" />);
    expect(screen.getByRole("checkbox", { name: "All" })).toHaveAttribute("aria-checked", "mixed");
  });

  it("does not toggle when disabled", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox aria-label="Locked" disabled onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Locked" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Checkbox aria-label="Include tests" />);
    await expect(container).toHaveNoA11yViolations();
  });
});

describe("Switch", () => {
  it("toggles with the keyboard and reports state", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch aria-label="Auto-merge" onCheckedChange={onCheckedChange} />);

    const control = screen.getByRole("switch", { name: "Auto-merge" });
    expect(control).toHaveAttribute("aria-checked", "false");

    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Switch aria-label="Auto-merge" />);
    await expect(container).toHaveNoA11yViolations();
  });
});
