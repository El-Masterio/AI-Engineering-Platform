import { render, screen } from "@testing-library/react";
import { Rocket } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { Card, StatCard } from "./card.js";
import { Checkbox } from "./checkbox.js";
import { Field } from "./field.js";
import { Icon } from "./icon.js";
import { Input } from "./input.js";
import { StatusIndicator, RUN_STATUSES } from "./status-indicator.js";
import { Switch } from "./switch.js";
import { Textarea } from "./textarea.js";
import { Avatar } from "./avatar.js";
import { THEMES, DEFAULT_THEME, THEME_BASE_COLOR, getTheme, setTheme } from "../tokens/theme.js";

/**
 * Design System v2.0 conformance.
 *
 * jsdom applies no stylesheet, so nothing here can assert a computed colour —
 * that is what scripts/check-contrast.mjs does over the token set, and what
 * Storybook verifies visually. What IS meaningful to assert here are the
 * structural claims the architecture rests on, each of which was prose until
 * now: that components never reach past the semantic layer, that the palette
 * still matches the directive, and that the duplicated theme-color literal
 * stays in sync.
 */

const TOKENS_PATH = "packages/ui/src/tokens/tokens.css";
const PRIMITIVES_DIR = "packages/ui/src/primitives";

/** Class-string literals in one file that pair `outline-none` with a focus ring. */
function focusRingConflicts(file: string, source: string): string[] {
  return [...source.matchAll(/"([^"\n]*)"/g)]
    .map((m) => m[1] ?? "")
    .filter((lit) => lit.includes("outline-none") && lit.includes("focus-visible:outline"))
    .map((lit) => `${file}: ${lit.slice(0, 60)}`);
}

function AllPrimitives() {
  return (
    <>
      <Button>Approve</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="danger" disabled>
        Delete
      </Button>
      <Button loading>Saving</Button>
      <Card>Card body</Card>
      <StatCard label="Runs" value="47" hint="this week" />
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

afterEach(() => {
  delete document.documentElement.dataset["theme"];
});

describe("primitives", () => {
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

  it("has no accessibility violations", async () => {
    setTheme(document, DEFAULT_THEME);
    const { container } = render(<AllPrimitives />);
    await expect(container).toHaveNoA11yViolations();
  });
});

describe("two-layer token architecture", () => {
  /**
   * The load-bearing rule of the whole design system: components read SEMANTIC
   * tokens, never primitives. It is what let v2.0 replace every colour in the
   * product by editing one file. Until this test existed the rule was a comment,
   * and a comment does not fail a build.
   */
  it("no component references a primitive token directly", async () => {
    const primitivePattern = /var\(\s*--(?:w|s|o|b|sb|ok|warn|err|info|chart)-\d+/;
    const entries = await readdir(PRIMITIVES_DIR);
    const files = entries.filter(
      (f) => f.endsWith(".tsx") && !f.includes(".test.") && !f.includes(".stories."),
    );
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(PRIMITIVES_DIR, file), "utf8");
      if (primitivePattern.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * `outline-none` next to `focus-visible:outline-2` produces NO focus ring.
   * Tailwind's `outline-2` sets outline-WIDTH; nothing sets outline-STYLE, so the
   * `none` from `outline-none` stands and the ring is invisible — a WCAG 2.4.7
   * failure that looks correct in the source and only shows up by tabbing
   * through the running app.
   *
   * This shipped once. It was masked because tokens.css declared `:focus-visible`
   * unlayered, and unlayered CSS outranks every cascade layer, so the global ring
   * silently supplied the missing style. Moving that rule into `@layer base` —
   * correct, because components must be able to override it — removed the crutch
   * and exposed every component at once.
   *
   * tokens.css now owns the ring. Components should not re-declare it.
   */
  it("no component pairs outline-none with a focus-visible outline", async () => {
    const entries = await readdir(PRIMITIVES_DIR);
    const files = entries.filter(
      (f) => f.endsWith(".tsx") && !f.includes(".test.") && !f.includes(".stories."),
    );

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(PRIMITIVES_DIR, file), "utf8");
      offenders.push(...focusRingConflicts(file, source));
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the focus ring in a cascade layer components can override", async () => {
    const css = await readFile(TOKENS_PATH, "utf8");
    // The base block must be layered, or it outranks every Tailwind utility.
    expect(css).toMatch(/@layer base\s*\{/);
    const baseBlock = css.slice(css.indexOf("@layer base"));
    expect(baseBlock).toContain(":focus-visible");
    expect(baseBlock).toMatch(/outline:\s*2px solid var\(--border-focus\)/);
  });

  it("keeps the directive palette intact", async () => {
    // Asserts the DECLARATION, not mere presence of the string. An earlier
    // version used toContain and was inert: #f06d22 also appears in --chart-1,
    // in --gradient-primary and in a comment, so drifting --o-500 still passed.
    const css = await readFile(TOKENS_PATH, "utf8");
    const declarations = new Map(
      [...css.replaceAll(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)] //
        .map((m) => [m[1], m[2]?.toLowerCase()]),
    );

    // Left column: the token. Right column: the value the directive specifies.
    /* eslint-disable no-restricted-syntax -- justified: this table IS the
       directive's palette. Naming the literals is the entire point of the test —
       it is what catches a token drifting away from the specified colour. */
    const specified: Readonly<Record<string, string>> = {
      "--o-500": "#f06d22", // primary orange
      "--o-400": "#ff7a2c", // hover orange
      "--o-600": "#d95f18", // pressed orange
      "--o-50": "#ffe9db", // soft orange
      "--b-500": "#7695e6", // sky blue
      "--b-100": "#e6edff", // light blue
      "--w-0": "#ffffff", // cards
      "--w-25": "#fbfaf8", // elevated surface
      "--w-50": "#f7f5f1", // primary background
      "--w-100": "#f1eee9", // secondary background
      "--w-150": "#ece8e2", // sidebar
      "--w-200": "#e5e2dc", // secondary border
      "--w-300": "#dad6cf", // primary border
      "--s-900": "#1e2430", // primary text
      "--s-700": "#556070", // secondary text
      "--s-500": "#7c8797", // muted
      "--s-400": "#a2acba", // placeholder
      "--s-300": "#c3cbd6", // disabled
      "--s-200": "#d3d9e2", // input border
      "--err-500": "#d95a5a", // error
      "--chart-1": "#f06d22",
      "--chart-2": "#7695e6",
      "--chart-3": "#5f6ea8",
      "--chart-4": "#34b56a",
      "--chart-5": "#d99b22",
      "--chart-6": "#bfc8d3",
    };
    /* eslint-enable no-restricted-syntax */

    for (const [token, colour] of Object.entries(specified)) {
      expect(declarations.get(token), `${token} is fixed by the directive`).toBe(colour);
    }
  });
});

describe("theme", () => {
  it("defaults to the single specified palette", () => {
    expect(THEMES).toEqual(["light"]);
    expect(getTheme(document)).toBe(DEFAULT_THEME);
  });

  it("applies a theme to the document", () => {
    setTheme(document, "light");
    expect(getTheme(document)).toBe("light");
  });

  it("keeps THEME_BASE_COLOR equal to --bg-base in tokens.css", async () => {
    // Browser-chrome metadata cannot read a CSS variable, so the literal is
    // duplicated by necessity. This test is what keeps the duplicate honest.
    // Vitest runs from the repo root; import.meta.url is not a file: URL here.
    const css = await readFile(TOKENS_PATH, "utf8");
    const primitives = new Map(
      [...css.matchAll(/(--w-\d+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
    );
    const baseVariable = /\[data-theme="light"\][^}]*--bg-base:\s*var\((--[\w-]+)\)/s.exec(css);

    expect(primitives.get(baseVariable?.[1] ?? "")).toBe(THEME_BASE_COLOR.light);
  });
});
