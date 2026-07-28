"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, CornerDownLeft, FolderKanban, Search, Settings } from "lucide-react";
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@atelier/ui";

/**
 * CommandPalette — the search in the top navigation (§18 v2.0).
 *
 * The trigger is a button that looks like a field, which is the pattern Linear
 * and Vercel use. That is only honest if it actually opens something: a field
 * you cannot type into is worse than no field at all, and the first version of
 * this shipped as exactly that.
 *
 * Destinations are static for now. They become a real query against projects,
 * runs and agents once the API exists (M016+); the interaction, the keyboard
 * contract and the a11y wiring are what this component locks in.
 */

type Destination = { href: string; label: string; group: string; icon: typeof Boxes };

const DESTINATIONS: readonly Destination[] = [
  { href: "/projects", label: "Projects", group: "Navigate", icon: FolderKanban },
  { href: "/agents", label: "Agents", group: "Navigate", icon: Boxes },
  { href: "/settings", label: "Settings", group: "Navigate", icon: Settings },
  {
    href: "/projects/inventory-system",
    label: "Inventory system",
    group: "Projects",
    icon: FolderKanban,
  },
  {
    href: "/projects/billing-portal",
    label: "Billing portal",
    group: "Projects",
    icon: FolderKanban,
  },
  { href: "/projects/internal-crm", label: "Internal CRM", group: "Projects", icon: FolderKanban },
];

/** True when the event came from somewhere the user is actually typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = "command-palette-results";

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return DESTINATIONS;
    return DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q));
  }, [query]);

  // Keep the highlight in range as the result set shrinks under the cursor.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isSlash = event.key === "/" && !isTypingTarget(event.target);
      const isCommandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (isSlash || isCommandK) {
        event.preventDefault();
        setIsOpen(true);
      }
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  const onInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          setActiveIndex((i) =>
            results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
          );
          break;
        }
        case "Enter": {
          event.preventDefault();
          const target = results[activeIndex];
          if (target !== undefined) go(target.href);
          break;
        }
        default: {
          break;
        }
      }
    },
    [results, activeIndex, go],
  );

  const activeResult = results[activeIndex];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="search"
          className={cn(
            "flex h-10 w-full max-w-[420px] items-center gap-3 rounded-[var(--radius-control)]",
            "border border-[var(--border-default)] bg-[var(--bg-surface)] px-4",
            "text-[length:var(--text-small)] text-[var(--text-placeholder)]",
            "transition-colors duration-[--dur-fast] ease-[--ease-in-out]",
            "hover:border-[var(--border-strong)]",
          )}
        >
          <Search width={18} height={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="flex-1 text-left">Search projects and agents</span>
          <kbd
            aria-hidden="true"
            className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-0.5 font-mono text-[length:var(--text-caption)]"
          >
            /
          </kbd>
        </button>
      </DialogTrigger>

      <DialogContent
        align="top"
        hideClose
        className="p-0"
        data-testid="command-palette"
        // Radix focuses the content by default. Redirect it to the input: a
        // command palette whose field is not focused on open is broken, and
        // doing it here rather than with `autoFocus` keeps Radix in charge of
        // focus and restores it correctly on close.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Find a project, an agent, or a page. Use the arrow keys to move and Enter to go.
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4">
          <Search
            width={18}
            height={18}
            strokeWidth={1.75}
            aria-hidden="true"
            className="shrink-0 text-[var(--text-tertiary)]"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search projects and agents"
            aria-label="Search projects and agents"
            aria-controls={listId}
            aria-activedescendant={activeResult === undefined ? undefined : `cp-${activeIndex}`}
            className={cn(
              "h-14 flex-1 bg-transparent text-[length:var(--text-body)] text-[var(--text-primary)]",
              "placeholder:text-[var(--text-placeholder)] outline-none",
            )}
          />
        </div>

        <ul id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-[length:var(--text-small)] text-[var(--text-tertiary)]">
              Nothing matches “{query}”.
            </li>
          ) : (
            results.map((d, index) => {
              const ItemIcon = d.icon;
              const isActive = index === activeIndex;
              return (
                /* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- justified:
                   this is the aria-activedescendant listbox pattern. The options are
                   deliberately not focusable; every keyboard interaction (Arrow keys,
                   Enter, Escape) is handled on the input that owns the listbox, which
                   is what the ARIA authoring practices prescribe. Adding key handlers
                   to an element that can never receive focus would be dead code. */
                <li
                  key={d.href}
                  id={`cp-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(d.href)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5",
                    "text-[length:var(--text-small)]",
                    isActive
                      ? "bg-[var(--bg-selected)] text-[var(--secondary-soft-fg)]"
                      : "text-[var(--text-primary)]",
                  )}
                >
                  <ItemIcon width={18} height={18} strokeWidth={1.75} aria-hidden="true" />
                  <span className="flex-1">{d.label}</span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-tertiary)]">
                    {d.group}
                  </span>
                  {isActive ? (
                    <CornerDownLeft
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="text-[var(--text-tertiary)]"
                    />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
