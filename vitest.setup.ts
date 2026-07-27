import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import axe from "axe-core";

/**
 * jsdom gaps that Radix's positioned overlays (Select, Tooltip, Dropdown) rely
 * on. These are environment shims, not behaviour stubs — the components' real
 * logic still runs; only layout measurement, which jsdom has none of, is faked.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no layout in jsdom */
  };
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!globalThis.DOMRect) {
  globalThis.DOMRect = class DOMRect {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    top = 0;
    left = 0;
    right = 0;
    bottom = 0;
    toJSON() {
      return this;
    }
    static fromRect() {
      return new DOMRect();
    }
  } as unknown as typeof DOMRect;
}

afterEach(() => {
  cleanup();
});

/**
 * `toHaveNoA11yViolations` — axe-core assertion used by every component test
 * (M008 acceptance: "axe clean").
 *
 * Runs against the element in place rather than a detached clone so that
 * inherited styles and ARIA relationships are evaluated as they actually are.
 */
expect.extend({
  async toHaveNoA11yViolations(received: HTMLElement) {
    const results = await axe.run(received, {
      // colour-contrast needs real layout; jsdom computes none, so it produces
      // false negatives here. Token contrast is verified separately and far more
      // rigorously by scripts/check-contrast.mjs.
      rules: { "color-contrast": { enabled: false } },
    });

    if (results.violations.length === 0) {
      return { pass: true, message: () => "expected accessibility violations, found none" };
    }

    const detail = results.violations
      .map(
        (v) =>
          `  [${v.impact ?? "unknown"}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`,
      )
      .join("\n");

    return {
      pass: false,
      message: () =>
        `expected no accessibility violations, found ${results.violations.length}:\n${detail}`,
    };
  },
});

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- justified: declaration merging into an external module requires `interface`; a type alias cannot merge.
  interface Matchers<T = unknown> {
    toHaveNoA11yViolations: () => Promise<T>;
  }
}
