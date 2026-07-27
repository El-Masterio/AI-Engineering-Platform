"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Boxes,
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { cn, Tooltip, TooltipProvider, getTheme, toggleTheme, type Theme } from "@atelier/ui";

/**
 * AppShell — collapsible sidebar + topbar (§18).
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
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setIsCollapsed(isStoredCollapsed());
    setThemeState(getTheme(document));
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

  const onToggleTheme = useCallback(() => {
    setThemeState(toggleTheme(document));
  }, []);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh bg-[var(--bg-base)] text-[var(--text-primary)]">
        <aside
          data-testid="sidebar"
          data-collapsed={isCollapsed}
          aria-label="Main"
          className={cn(
            "flex shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]",
            "transition-[width] duration-[--dur-normal] ease-[--ease-out] motion-reduce:transition-none",
            isCollapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]",
          )}
        >
          <div className="flex h-[var(--topbar-h)] items-center gap-2 border-b border-[var(--border-subtle)] px-3">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--accent-bg)] font-mono text-[length:var(--text-xs)] font-bold text-[var(--accent-fg)]"
            >
              A
            </span>
            {isCollapsed ? null : (
              <span className="truncate text-[length:var(--text-sm)] font-semibold">Atelier</span>
            )}
          </div>

          <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 p-2">
            {NAV.map(({ href, label, icon: ItemIcon }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              const link = (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                    "text-[length:var(--text-sm)] transition-colors duration-[--dur-instant]",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
                    isActive
                      ? "bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                    isCollapsed && "justify-center px-0",
                  )}
                >
                  <ItemIcon width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
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

          <div className="border-t border-[var(--border-subtle)] p-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!isCollapsed}
              aria-controls="app-content"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-testid="sidebar-toggle"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5",
                "text-[length:var(--text-xs)] text-[var(--text-tertiary)]",
                "transition-colors duration-[--dur-instant] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
                isCollapsed && "justify-center px-0",
              )}
            >
              {isCollapsed ? (
                <PanelLeftOpen width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <PanelLeftClose width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
              )}
              {isCollapsed ? null : <span>Collapse</span>}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[var(--topbar-h)] shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4">
            <Breadcrumb pathname={pathname} />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              data-testid="theme-toggle"
              className={cn(
                "grid size-7 place-items-center rounded-md text-[var(--text-tertiary)]",
                "transition-colors duration-[--dur-instant] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
              )}
            >
              {theme === "dark" ? (
                <Sun width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Moon width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          </header>

          <main id="app-content" className="min-w-0 flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-[length:var(--text-xs)]">
        {segments.length === 0 ? (
          <li className="text-[var(--text-secondary)]">Home</li>
        ) : (
          segments.map((segment, index) => (
            <li key={segment} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                  /
                </span>
              ) : null}
              <span
                className={cn(
                  "truncate",
                  index === segments.length - 1
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-tertiary)]",
                )}
              >
                {segment}
              </span>
            </li>
          ))
        )}
      </ol>
    </nav>
  );
}
