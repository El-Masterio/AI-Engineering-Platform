import type { Preview, Decorator } from "@storybook/react-vite";
import { DEFAULT_THEME } from "../packages/ui/src/tokens/theme.js";
import "../packages/ui/src/tokens/theme.css";

/**
 * Every story renders under a real `data-theme` so the gallery matches the app.
 *
 * Design System v2.0 specifies one palette, so the theme toolbar that shipped
 * with v1 was removed rather than left as a control with a single option. The
 * decorator stays: it is what M083 needs when a dark palette is added.
 */
const withTheme: Decorator = (Story) => {
  document.documentElement.dataset["theme"] = DEFAULT_THEME;
  return Story();
};

const preview: Preview = {
  decorators: [withTheme],
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    controls: { expanded: true },
  },
};

export default preview;
