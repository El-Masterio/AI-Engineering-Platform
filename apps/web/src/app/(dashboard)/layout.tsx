import { AppShell } from "@/components/app-shell";

/**
 * The (dashboard) route group: everything rendered inside the AppShell chrome.
 * Grouping keeps future auth screens — which have no shell — out of this layout.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
