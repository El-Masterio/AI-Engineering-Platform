import type { Metadata } from "next";
import { Card } from "@atelier/ui";
import { MemberList, type Member } from "@/components/member-list";

export const metadata: Metadata = { title: "Organization · Atelier" };

/**
 * Organization settings (FR-ORG-3, FR-ORG-5).
 *
 * `memberships` is visible only within the claimed organization, so this page
 * cannot show another tenant's people even if a query forgot to filter.
 *
 * The list is empty until the API routes exist. Shipping a screen that reads
 * from a route which has not been written would be a worse placeholder than an
 * obviously empty one.
 */
const MEMBERS_PENDING_API: readonly Member[] = [];

export default function OrganizationSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[length:var(--text-h1)] font-bold text-[var(--text-primary)]">
          Organization
        </h1>
        <p className="mt-1 text-[length:var(--text-body)] text-[var(--text-secondary)]">
          Name, slug and the people who have access.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="font-display text-[length:var(--text-h3)] font-bold text-[var(--text-primary)]">
          Members
        </h2>
        <div className="mt-4">
          <MemberList members={MEMBERS_PENDING_API} />
        </div>
      </Card>
    </div>
  );
}
