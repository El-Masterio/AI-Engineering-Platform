import type { Preview, Decorator } from "@storybook/react-vite";
import "../packages/ui/src/tokens/theme.css";

/**
 * Every story renders under a real `data-theme`, so "renders correctly in both
 * themes" (M008 acceptance) is checked by looking rather than by hoping. The
 * toolbar switches themes live.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals["theme"] as string) ?? "dark";
  document.documentElement.dataset["theme"] = theme;
  return Story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Design-system theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "dark" },
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    controls: { expanded: true },
  },
};

export default preview;
