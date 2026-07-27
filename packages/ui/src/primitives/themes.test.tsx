import { render, screen } from "@testing-library/react";
import { Rocket } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { Checkbox } from "./checkbox.js";
import { Field } from "./field.js";
import { Icon } from "./icon.js";
import { Input } from "./input.js";
import { StatusIndicator, RUN_STATUSES } from "./status-indicator.js";
import { Switch } from "./switch.js";
import { Textarea } from "./textarea.js";
import { Avatar } from "./avatar.js";
import { THEMES, getTheme, setTheme, toggleTheme, resolveInitialTheme } from "../tokens/theme.js";

/**
 * "Renders correctly in both themes" (M008 acceptance).
 *
 * jsdom applies no stylesheet, so this cannot assert computed colour — that is
 * what scripts/check-contrast.mjs verifies over the token set, and what
 * Storybook's theme toolbar verifies visually. What IS meaningful to assert
 * here is the property the architecture depends on: components carry no
 * theme-conditional logic, so switching `data-theme` changes nothing about
 * their structure, roles, or accessible names. If a component ever branched on
 * the theme, this test would catch it.
 */

function AllPrimitives() {
  return (
    <>
      <Button>Approve</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="danger" disabled>
        Delete
      </Button>
      <Button loading>Saving</Button>
      <Badge tone="ok">Passed</Badge>
      <Badge tone="err">Failed</Badge>
      <Icon icon={Rocket} label="Deploy" />
      {RUN_STATUSES.map((s) => (
        <StatusIndicator key={s} status={s} />
      ))}
      <Field label="Project name" description="Shown in the dashboard.">
        {(p) => <Input {...p} />}
      </Field>
      <Field label="Goal" error="Required.">
        {(p) => <Textarea {...p} />}
      </Field>
      <Checkbox aria-label="Include tests" />
      <Switch aria-label="Auto-merge" />
      <Avatar name="Ada Lovelace" />
      <Avatar name="Code Reviewer" kind="agent" />
    </>
  );
}

/** Structural fingerprint: roles + accessible names, ignoring styling. */
function fingerprint(container: HTMLElement): string {
  return [...container.querySelectorAll("*")]
    .map((el) => {
      const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
      const name = el.getAttribute("aria-label") ?? "";
      return `${role}:${name}`;
    })
    .join("|");
}

afterEach(() => {
  delete document.documentElement.dataset["theme"];
});

describe("both themes", () => {
  it.each(THEMES)("renders every primitive under data-theme=%s", (theme) => {
    setTheme(document, theme);
    const { container } = render(<AllPrimitives />);

    expect(document.documentElement.dataset["theme"]).toBe(theme);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include tests" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Auto-merge" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("produces an identical structure in both themes", () => {
    setTheme(document, "dark");
    const dark = render(<AllPrimitives />);
    const darkPrint = fingerprint(dark.container);
    dark.unmount();

    setTheme(document, "light");
    const light = render(<AllPrimitives />);
    const lightPrint = fingerprint(light.container);

    // Any divergence means a component branched on the theme, which would break
    // the "remap semantics, never edit components" rule the token system rests on.
    expect(lightPrint).toBe(darkPrint);
  });

  it("has no accessibility violations in either theme", async () => {
    for (const theme of THEMES) {
      setTheme(document, theme);
      const { container, unmount } = render(<AllPrimitives />);
      await expect(container).toHaveNoA11yViolations();
      unmount();
    }
  });
});

describe("theme switching", () => {
  it("defaults to dark when nothing is set", () => {
    expect(getTheme(document)).toBe("dark");
  });

  it("round-trips through set and toggle", () => {
    setTheme(document, "light");
    expect(getTheme(document)).toBe("light");
    expect(toggleTheme(document)).toBe("dark");
    expect(getTheme(document)).toBe("dark");
  });

  it("prefers a stored choice over the OS preference", () => {
    localStorage.setItem("atelier-theme", "light");
    const fakeWindow = {
      localStorage,
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    expect(resolveInitialTheme(fakeWindow)).toBe("light");
    localStorage.clear();
  });

  it("falls back to the OS preference when nothing is stored", () => {
    const fakeWindow = {
      localStorage,
      matchMedia: (q: string) => ({ matches: q.includes("light") }),
    } as unknown as Window;
    expect(resolveInitialTheme(fakeWindow)).toBe("light");
  });
});
