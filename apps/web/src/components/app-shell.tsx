"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Boxes,
  ChevronsUpDown,
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { cn, Avatar, Tooltip, TooltipProvider } from "@atelier/ui";
// Extensionless: apps/web resolves with `moduleResolution: bundler`, unlike
// packages/ui, which is NodeNext and needs the `.js` suffix.
import { CommandPalette } from "./command-palette";

/**
 * AppShell — sidebar + top navigation (§18 v2.0).
 *
 * The directive is specific about both halves. The sidebar sits on the warm
 * #ece8e2 surface with muted slate icons, and the active item is marked by a
 * blue left border over a soft blue field — blue, not orange, because orange is
 * reserved for actions and progress. The top navigation carries exactly four
 * things (workspace, search, notifications, user) and nothing else; a
 * breadcrumb was removed from it as clutter, with the page heading now the sole
 * wayfinding.
 *
 * Collapse state persists across reloads: an engineer who collapses the sidebar
 * means it, and re-expanding on every navigation would be a papercut on a tool
 * people keep open all day.
 */

const SIDEBAR_STORAGE_KEY = "atelier-sidebar-collapsed";

type NavItem = { href: string; label: string; icon: typeof Boxes };

const NAV: readonly NavItem[] = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/agents", label: "Agents", icon: Boxes },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isStoredCollapsed(): boolean {
  try {
    return globalThis.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Start expanded on the server, then reconcile after mount. Reading storage
  // during render would produce a hydration mismatch.
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(isStoredCollapsed());
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((previous) => {
      const shouldCollapse = !previous;
      try {
        globalThis.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(shouldCollapse));
      } catch {
        // Storage unavailable — the toggle still works for this session.
      }
      return shouldCollapse;
    });
  }, []);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh bg-[var(--bg-base)] text-[var(--text-primary)]">
        <aside
          data-testid="sidebar"
          data-collapsed={isCollapsed}
          aria-label="Main"
          className={cn(
            "flex shrink-0 flex-col border-r border-[var(--border-muted)] bg-[var(--bg-sidebar)]",
            "transition-[width] duration-[--dur-normal] ease-[--ease-in-out] motion-reduce:transition-none",
            isCollapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]",
          )}
        >
          <div
            className={cn(
              "flex h-[var(--topbar-h)] shrink-0 items-center gap-3",
              isCollapsed ? "justify-center px-0" : "px-6",
            )}
          >
            {/* The one place the vivid brand orange (#f06d22) carries text.
                White on it measures 3.04:1, under the 4.5:1 body-text floor —
                permitted because WCAG 1.4.3 exempts logotypes, and marked here
                so the exemption is visible rather than assumed. Everywhere else
                text sits on --accent-bg, which clears the bar. */}
            <span
              aria-hidden="true"
              data-logotype
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                "bg-[var(--brand)] font-display text-[length:var(--text-small)]",
                "font-extrabold text-[var(--accent-fg)]",
              )}
            >
              A
            </span>
            {isCollapsed ? null : (
              <span className="truncate font-display text-[length:var(--text-h5)] font-extrabold tracking-[var(--tracking-tight)]">
                Atelier
              </span>
            )}
          </div>

          <nav
            aria-label="Primary"
            className={cn("flex flex-1 flex-col gap-1 py-4", isCollapsed ? "px-2" : "px-4")}
          >
            {NAV.map(({ href, label, icon: ItemIcon }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              const link = (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-[var(--radius-control)]",
                    "px-3 py-3 text-[length:var(--text-small)]",
                    "transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
                    // Active: soft blue field, blue label, and a blue bar down
                    // the leading edge. Three signals, only one of them colour.
                    isActive
                      ? [
                          "bg-[var(--secondary-soft-bg)] text-[var(--secondary-soft-fg)]",
                          "font-semibold",
                          "before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px]",
                          "before:rounded-full before:bg-[var(--secondary-strong)]",
                        ].join(" ")
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                    isCollapsed && "justify-center px-0",
                  )}
                >
                  <ItemIcon width={20} height={20} strokeWidth={1.75} aria-hidden="true" />
                  {/* Collapsed keeps the accessible name — the link never
                      becomes an unlabelled icon. */}
                  <span className={cn(isCollapsed && "sr-only")}>{label}</span>
                </Link>
              );

              return isCollapsed ? (
                <Tooltip key={href} content={label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              );
            })}
          </nav>

          <div className={cn("py-4", isCollapsed ? "px-2" : "px-4")}>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!isCollapsed}
              aria-controls="app-content"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-testid="sidebar-toggle"
              className={cn(
                "flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-3",
                "text-[length:var(--text-caption)] text-[var(--text-tertiary)]",
                "transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
                "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                isCollapsed && "justify-center px-0",
              )}
            >
              {isCollapsed ? (
                <PanelLeftOpen width={20} height={20} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <PanelLeftClose width={20} height={20} strokeWidth={1.75} aria-hidden="true" />
              )}
              {isCollapsed ? null : <span>Collapse</span>}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="app-content" className="min-w-0 flex-1 overflow-auto px-8 py-8">
            <div className="mx-auto w-full max-w-[var(--container-max)]">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Shared chrome for the three icon-only controls on the right of the top bar. */
const topBarButton = [
  "grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)]",
  "text-[var(--text-tertiary)] transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
  "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
].join(" ");

function TopBar() {
  return (
    <header
      data-testid="topbar"
      className={cn(
        "flex h-[var(--topbar-h)] shrink-0 items-center gap-4 px-8",
        "border-b border-[var(--border-muted)]",
      )}
    >
      <button
        type="button"
        data-testid="workspace-switcher"
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-[var(--radius-control)] py-2 pl-2 pr-3",
          "transition-colors duration-[--dur-fast] ease-[--ease-in-out] hover:bg-[var(--bg-hover)]",
        )}
      >
        <Avatar name="Atelier Studio" size="sm" />
        <span className="truncate text-[length:var(--text-small)] font-semibold">
          Atelier Studio
        </span>
        <ChevronsUpDown
          width={16}
          height={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="shrink-0 text-[var(--text-tertiary)]"
        />
        <span className="sr-only">Switch workspace</span>
      </button>

      <div className="flex flex-1 justify-center">
        <CommandPalette />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label="Notifications" className={topBarButton}>
          <Bell width={20} height={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Account menu"
          data-testid="user-menu"
          className={cn(topBarButton, "text-[var(--text-primary)]")}
        >
          <Avatar name="Ada Lovelace" size="sm" />
        </button>
      </div>
    </header>
  );
}
