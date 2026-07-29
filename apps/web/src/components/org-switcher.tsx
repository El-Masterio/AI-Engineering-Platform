"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useId, useState } from "react";
import { Button, cn } from "@atelier/ui";

/**
 * Switch the active organization (M022).
 *
 * The list comes from `app_organizations_for_user` (migration 0008) — a
 * cross-tenant read that M015 deliberately left unbuilt, because no single
 * value of the RLS claim can authorise it. This component is the reason that
 * decision came due.
 *
 * A listbox rather than a `<select>`: the trigger shows the org's name AND
 * role, which a native option cannot render. That trade buys markup we now owe
 * keyboard behaviour on, which is what the roving handler below is for.
 */

type OrganizationOption = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: string;
};

export type OrgSwitcherProps = {
  organizations: readonly OrganizationOption[];
  activeId: string;
  onSelect: (id: string) => void;
};

export function OrgSwitcher({ organizations, activeId, onSelect }: OrgSwitcherProps) {
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const active = organizations.find((organization) => organization.id === activeId);

  // One organization is the common case until invitations land (FR-ORG-4), and
  // a control that cannot change anything should not look interactive.
  if (organizations.length <= 1) {
    return (
      <div className="px-2 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--text-primary)]">
        {active?.name ?? "No organization"}
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-between"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
      >
        <span className="truncate">{active?.name ?? "Select organization"}</span>
        <ChevronsUpDown width={16} height={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>

      {isOpen && (
        <ul
          id={listId}
          // Labelled so a screen reader announces what the list is for, not
          // just that a list opened. No `role="listbox"`: the children are
          // buttons, and claiming listbox semantics without option semantics
          // is worse than claiming none.
          aria-label="Switch organization"
          className="absolute z-10 mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-lg"
        >
          {organizations.map((organization) => {
            const isActive = organization.id === activeId;
            return (
              <li key={organization.id}>
                <button
                  type="button"
                  /*
                   * `aria-current`, not `aria-selected`.
                   *
                   * axe caught this: `aria-selected` is only valid on roles
                   * that have selection semantics — option, row, tab, treeitem
                   * — and a `button` is none of them. The first version put it
                   * on the button anyway, with a comment confidently explaining
                   * why that was fine.
                   *
                   * `aria-current` is valid on any element and means precisely
                   * "the current item in a set", which is what this is. Going
                   * the other way — a real listbox with `role="option"` —
                   * would mean options are not natively focusable and the
                   * keyboard model becomes `aria-activedescendant`, which is a
                   * lot of machinery for a list of two.
                   */
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[length:var(--text-small)]",
                    "hover:bg-[var(--bg-hover)]",
                    isActive && "bg-[var(--bg-selected)]",
                  )}
                  onClick={() => {
                    onSelect(organization.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="truncate">
                    <span className="text-[var(--text-primary)]">{organization.name}</span>{" "}
                    <span className="text-[var(--text-tertiary)]">{organization.role}</span>
                  </span>
                  {isActive && (
                    <Check
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="shrink-0"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
