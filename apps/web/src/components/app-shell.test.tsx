import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell.js";

// next/navigation is a framework boundary; stub it so the shell can be tested
// in isolation. Real routing is verified against the running app.
const pathname = vi.hoisted(() => ({ current: "/projects" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  pathname.current = "/projects";
  localStorage.clear();
});

describe("AppShell — sidebar", () => {
  it("renders navigation with an accessible name for each destination", () => {
    render(<AppShell>content</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    for (const label of ["Projects", "Agents", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the current route with aria-current", () => {
    pathname.current = "/agents";
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Projects" })).not.toHaveAttribute("aria-current");
  });

  it("treats a nested route as active on its parent nav item", () => {
    pathname.current = "/projects/inventory-system";
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
  });

  it("collapses and persists the choice", async () => {
    const user = userEvent.setup();
    render(<AppShell>content</AppShell>);

    const toggle = screen.getByTestId("sidebar-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    expect(localStorage.getItem("atelier-sidebar-collapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("restores the collapsed state on mount", () => {
    localStorage.setItem("atelier-sidebar-collapsed", "true");
    render(<AppShell>content</AppShell>);
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
  });

  it("keeps nav links named when collapsed — never an unlabelled icon", async () => {
    const user = userEvent.setup();
    render(<AppShell>content</AppShell>);
    await user.click(screen.getByTestId("sidebar-toggle"));
    for (const label of ["Projects", "Agents", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("survives unavailable storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const user = userEvent.setup();
    render(<AppShell>content</AppShell>);
    await user.click(screen.getByTestId("sidebar-toggle"));
    // The toggle still works for the session even though persistence failed.
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    setItem.mockRestore();
  });
});

describe("AppShell — top navigation", () => {
  /**
   * §18 v2.0 lists exactly four things in the top bar. This asserts all four
   * are present AND named — an icon-only control with no accessible name is the
   * defect this layout invites.
   */
  it("carries the workspace switcher, search, notifications and account menu", () => {
    render(<AppShell>content</AppShell>);
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-switcher")).toHaveAccessibleName(/switch workspace/i);
    expect(screen.getByTestId("search")).toHaveAccessibleName(/search projects and agents/i);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("carries nothing else — the directive calls a breadcrumb clutter", () => {
    render(<AppShell>content</AppShell>);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });
});

describe("AppShell — content", () => {
  it("renders its children in the main landmark", () => {
    render(<AppShell>page body</AppShell>);
    expect(screen.getByRole("main")).toHaveTextContent("page body");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<AppShell>content</AppShell>);
    await expect(container).toHaveNoA11yViolations();
  });
});
