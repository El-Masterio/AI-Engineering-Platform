import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";

describe("Button", () => {
  it("renders its label and is reachable by role", () => {
    render(<Button>Approve plan</Button>);
    expect(screen.getByRole("button", { name: "Approve plan" })).toBeInTheDocument();
  });

  it("is operable by keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Run</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Run" })).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("blocks interaction when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Deploy
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Deploy" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("announces the loading state and blocks interaction", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving" });
    // aria-busy matters: a spinner alone is invisible to assistive tech.
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders every variant and size without losing its accessible name", () => {
    const variants = ["primary", "secondary", "ghost", "danger"] as const;
    const sizes = ["sm", "md", "lg"] as const;

    for (const variant of variants) {
      for (const size of sizes) {
        const { unmount } = render(
          <Button variant={variant} size={size}>{`${variant}-${size}`}</Button>,
        );
        expect(screen.getByRole("button", { name: `${variant}-${size}` })).toBeInTheDocument();
        unmount();
      }
    }
  });

  it("delegates rendering with asChild", () => {
    render(
      <Button asChild>
        <a href="/projects">Projects</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <>
        <Button>Primary</Button>
        <Button variant="danger" disabled>
          Danger
        </Button>
        <Button loading>Loading</Button>
      </>,
    );
    await expect(container).toHaveNoA11yViolations();
  });
});
