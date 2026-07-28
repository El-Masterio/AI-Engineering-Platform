import type { Metadata, Viewport } from "next";
import { Manrope, Inter, JetBrains_Mono } from "next/font/google";
import { DEFAULT_THEME, THEME_BASE_COLOR } from "@atelier/ui";
import "./globals.css";

/**
 * Fonts are self-hosted by next/font: it downloads and serves them from our own
 * origin at build time, so there is no runtime request to a font CDN and no
 * layout shift while a webfont loads. `variable` binds each family to a CSS
 * custom property that globals.css feeds into the token layer — which is why
 * tokens.css can name "Manrope" without knowing how it arrived.
 */
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-loaded",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Atelier", template: "%s · Atelier" },
  description: "An AI engineering organization: plan, build, review, test, deliver.",
};

export const viewport: Viewport = {
  // Declared so the browser chrome matches the page before first paint.
  themeColor: THEME_BASE_COLOR[DEFAULT_THEME],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // v2.0 specifies a single palette, so the theme is static markup rather
      // than a pre-paint script. There is nothing to read from storage and
      // therefore no flash to prevent.
      data-theme={DEFAULT_THEME}
      className={`${manrope.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      {/* Browser extensions (ad blockers, password managers, Bitdefender's
          TrafficLight) inject attributes into <body> before React hydrates,
          which React reports as a hydration mismatch it "won't patch up".
          suppressHydrationWarning is one level deep — it silences attribute
          diffs on <body> itself and nothing inside it, so a real mismatch in
          the app still fails loudly. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
