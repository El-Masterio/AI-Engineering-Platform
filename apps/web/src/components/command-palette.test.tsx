import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./command-palette";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockClear();
});

/**
 * The first version of this control was a button styled as a search field that
 * did nothing at all. These tests exist so it cannot regress to that.
 */
describe("CommandPalette", () => {
  it("opens from the search control and focuses the input", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("search"));

    const input = await screen.findByRole("textbox", { name: /search projects and agents/i });
    expect(input).toHaveFocus();
  });

  it("opens on `/` and on Ctrl+K", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.keyboard("/");
    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
  });

  it("does not hijack `/` while the user is typing in the field", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));
    const input = await screen.findByRole("textbox", { name: /search projects/i });

    await user.type(input, "a/b");

    expect(input).toHaveValue("a/b");
  });

  it("filters as the user types", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));
    const input = await screen.findByRole("textbox", { name: /search projects/i });

    await user.type(input, "billing");

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Billing portal");
  });

  it("reports an empty result rather than showing nothing", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));
    await user.type(await screen.findByRole("textbox", { name: /search projects/i }), "zzzz");

    expect(within(screen.getByRole("listbox")).queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });

  it("navigates with the arrow keys and Enter", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));

    await user.keyboard("{ArrowDown}{Enter}");

    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("wraps the highlight at the end of the list", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));

    // Up from the first item lands on the last.
    await user.keyboard("{ArrowUp}{Enter}");

    expect(push).toHaveBeenCalledWith("/projects/internal-crm");
  });

  it("navigates on click", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));
    await user.click(await screen.findByRole("option", { name: /settings/i }));

    expect(push).toHaveBeenCalledWith("/settings");
  });

  it("tracks the active option with aria-activedescendant", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));
    const input = await screen.findByRole("textbox", { name: /search projects/i });

    expect(input).toHaveAttribute("aria-activedescendant", "cp-0");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", "cp-1");
  });

  it("has no accessibility violations when open", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<CommandPalette />);
    await user.click(screen.getByTestId("search"));
    await screen.findByTestId("command-palette");
    await expect(baseElement).toHaveNoA11yViolations();
  });
});
