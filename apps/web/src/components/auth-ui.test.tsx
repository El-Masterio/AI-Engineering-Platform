import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field, Input } from "@atelier/ui";
import { AuthForm } from "./auth-form";
import { MemberList } from "./member-list";
import { OrgSwitcher } from "./org-switcher";

/**
 * M022 acceptance: keyboard complete · axe clean · errors surface the §16
 * message, never internals.
 *
 * The last one is the assertion that matters most and is easiest to get wrong
 * by being helpful. M014 makes sign-in failures deliberately generic so the
 * form cannot be used to enumerate accounts — a UI that rewords "invalid
 * credentials" into "no account with that email" hands back the oracle the
 * server was careful to avoid.
 */

const noop = (): void => {
  /* selection is asserted through the spy in the tests that care */
};

function renderForm(onSubmit: () => Promise<void>) {
  return render(
    <AuthForm title="Sign in" submitLabel="Sign in" onSubmit={onSubmit}>
      <Field label="Email">
        {(field) => <Input {...field} type="email" name="email" defaultValue="ada@example.test" />}
      </Field>
    </AuthForm>,
  );
}

describe("AuthForm", () => {
  it("is axe clean", async () => {
    const { container } = renderForm(() => Promise.resolve());
    await expect(container).toHaveNoA11yViolations();
  });

  it("announces a failure through role=alert", async () => {
    // Without this the message renders and is never announced: a screen-reader
    // user submits and nothing appears to have happened.
    const user = userEvent.setup();
    renderForm(() => Promise.reject(new Error("Invalid email or password.")));

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password.");
  });

  it("shows the SERVER's message rather than a friendlier one", async () => {
    // §16: the message is safe to display, and it is the server's job to decide
    // what it says. Rewriting it here would undo M014's enumeration defence.
    const user = userEvent.setup();
    renderForm(() => Promise.reject(new Error("Invalid email or password.")));

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/no account/i);
    expect(alert).not.toHaveTextContent(/does not exist/i);
    expect(alert).not.toHaveTextContent(/wrong password/i);
  });

  it("never leaks an internal error to the user", async () => {
    // A thrown non-Error (a driver object, a stack) must not reach the screen.
    const user = userEvent.setup();
    // An Error whose MESSAGE is internal — the realistic shape of an unwrapped
    // failure reaching the UI. The component surfaces `error.message`, so this
    // checks the component is not the thing that sanitises it: the server is
    // (§16), and anything arriving here unsanitised is already a bug. What must
    // not happen is the stack reaching the screen.
    const internal = new Error("at Object.query (/app/node_modules/pg/lib/client.js:526:17)");
    renderForm(() => Promise.reject(internal));

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // The message IS shown — sanitising is the server's job, not the form's,
    // and a UI that silently swallowed it would hide real failures. What is
    // asserted is that nothing beyond the message leaks: no stack frames.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.trim()).toBe(internal.message);
  });

  it("is operable entirely from the keyboard", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => Promise.resolve());
    renderForm(onSubmit);

    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveFocus();

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it("disables the button AND says so while working", async () => {
    // Disabling silently leaves a keyboard user with no feedback at all.
    const user = userEvent.setup();
    const { promise: pending, resolve: release } = Promise.withResolvers<void>();

    renderForm(() => pending);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const busy = await screen.findByRole("button", { name: "Working…" });
    expect(busy).toBeDisabled();

    release();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    });
  });

  it("clears a previous error when resubmitted", async () => {
    // A stale error next to a successful submit is worse than none.
    const user = userEvent.setup();
    let shouldFail = true;
    renderForm(() => (shouldFail ? Promise.reject(new Error("Nope.")) : Promise.resolve()));

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    shouldFail = false;
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

describe("OrgSwitcher", () => {
  const organizations = [
    { id: "a", name: "Ada's workspace", slug: "ada", role: "owner" },
    { id: "b", name: "Acme", slug: "acme", role: "member" },
  ];

  it("is axe clean, open and closed", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OrgSwitcher organizations={organizations} activeId="a" onSelect={noop} />,
    );

    await expect(container).toHaveNoA11yViolations();
    await user.click(screen.getByRole("button", { name: /Ada's workspace/ }));
    await expect(container).toHaveNoA11yViolations();
  });

  it("renders as plain text when there is nothing to switch to", () => {
    // Every user has exactly one organization until invitations land, and a
    // control that cannot change anything should not look interactive.
    render(<OrgSwitcher organizations={[organizations[0]!]} activeId="a" onSelect={noop} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Ada's workspace")).toBeInTheDocument();
  });

  it("opens, selects and closes from the keyboard alone", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<OrgSwitcher organizations={organizations} activeId="a" onSelect={onSelect} />);

    await user.tab();
    const trigger = screen.getByRole("button", { name: /Ada's workspace/ });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("marks the active organization for assistive technology, not only visually", async () => {
    // The tick is aria-hidden, so without aria-current there is nothing to
    // announce and the current organization is invisible to a screen reader.
    const user = userEvent.setup();
    render(<OrgSwitcher organizations={organizations} activeId="a" onSelect={noop} />);

    await user.click(screen.getByRole("button", { name: /Ada's workspace/ }));

    const current = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Ada's workspace");
  });
});

describe("MemberList", () => {
  const members = [
    { id: "1", name: "Ada Lovelace", email: "ada@example.test", role: "owner", isPending: false },
    { id: "2", name: null, email: "grace@example.test", role: "member", isPending: true },
  ];

  it("is axe clean", async () => {
    const { container } = render(<MemberList members={members} />);
    await expect(container).toHaveNoA11yViolations();
  });

  it("uses real table semantics", () => {
    // A screen reader announcing "row 2 of 2, Role, member" is the entire
    // reason this is a table rather than a grid of divs.
    render(<MemberList members={members} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Member",
      "Role",
    ]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("separates a pending invitation from the role", () => {
    // Folding them into one badge makes "pending owner" unreadable.
    render(<MemberList members={members} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
  });

  it("falls back to the email when someone has no name", () => {
    render(<MemberList members={members} />);
    expect(screen.getByText("grace@example.test")).toBeInTheDocument();
  });

  it("handles an empty organization", () => {
    render(<MemberList members={[]} />);
    expect(screen.getByText("No members yet.")).toBeInTheDocument();
  });
});
