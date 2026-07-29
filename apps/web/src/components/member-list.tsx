import { Avatar, Badge } from "@atelier/ui";

/**
 * The people in the current organization (FR-ORG-5).
 *
 * Scoped by RLS rather than by a filter here: `memberships` is visible only
 * within the claimed tenant, so this component cannot show another
 * organization's people even if it tried.
 */

export type Member = {
  readonly id: string;
  readonly name: string | null;
  readonly email: string;
  readonly role: string;
  readonly isPending: boolean;
};

export function MemberList({ members }: { members: readonly Member[] }) {
  if (members.length === 0) {
    return (
      <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">No members yet.</p>
    );
  }

  return (
    // A real table, not a grid of divs: this is tabular data, and a screen
    // reader announcing "row 3 of 12, Role, Admin" is the whole reason table
    // semantics exist.
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">People in this organization</caption>
      <thead>
        <tr className="border-b border-[var(--border-subtle)]">
          <th
            scope="col"
            className="py-2 text-[length:var(--text-small)] text-[var(--text-tertiary)]"
          >
            Member
          </th>
          <th
            scope="col"
            className="py-2 text-[length:var(--text-small)] text-[var(--text-tertiary)]"
          >
            Role
          </th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.id} className="border-b border-[var(--border-subtle)] last:border-0">
            <td className="py-3">
              <div className="flex items-center gap-3">
                <Avatar name={member.name ?? member.email} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[length:var(--text-body)] text-[var(--text-primary)]">
                    {member.name ?? member.email}
                  </p>
                  {member.name !== null && (
                    <p className="truncate text-[length:var(--text-caption)] text-[var(--text-tertiary)]">
                      {member.email}
                    </p>
                  )}
                </div>
              </div>
            </td>
            <td className="py-3">
              <div className="flex items-center gap-2">
                <Badge tone="neutral" className="capitalize">
                  {member.role}
                </Badge>
                {/* Pending is a state, not a role — conflating them in one
                    badge would make "pending owner" unreadable. */}
                {member.isPending && <Badge tone="warn">Pending</Badge>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
