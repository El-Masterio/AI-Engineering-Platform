import { type ReactNode } from "react";

/**
 * PageHeader — title, one line of context, optional actions.
 *
 * Every screen opens the same way, which is most of what "consistent" means to
 * someone using the product. The heading is set in the display face at 32px
 * (§18 H3); the page title is also the only wayfinding, since v2.0's top
 * navigation deliberately carries no breadcrumb.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-[length:var(--text-h3)]">{title}</h1>
        {description === undefined ? null : (
          <p className="max-w-[var(--container-prose)] text-[length:var(--text-body)] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions === undefined ? null : <div className="flex shrink-0 gap-3">{actions}</div>}
    </header>
  );
}
