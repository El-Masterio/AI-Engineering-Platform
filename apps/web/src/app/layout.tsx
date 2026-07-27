import type { Metadata, Viewport } from "next";
import { THEME_INIT_SCRIPT, THEME_BASE_COLOR } from "@atelier/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Atelier", template: "%s · Atelier" },
  description: "An AI engineering organization: plan, build, review, test, deliver.",
};

export const viewport: Viewport = {
  // Dark-first (§18). Declared so the browser chrome matches before paint.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_BASE_COLOR.dark },
    { media: "(prefers-color-scheme: light)", color: THEME_BASE_COLOR.light },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the page never renders in the wrong theme
            and then corrects itself. Must be synchronous, hence the raw script. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
