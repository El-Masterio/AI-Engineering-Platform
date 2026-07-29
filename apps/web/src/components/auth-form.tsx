"use client";

import { type FormEvent, type ReactNode, useId, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button, Card } from "@atelier/ui";

/**
 * The shell every auth screen shares.
 *
 * Centralised for one reason that is not tidiness: **error announcement**. A
 * form error rendered as ordinary text is invisible to a screen reader — the
 * user submits, nothing appears to happen, and there is no way to discover why.
 * Getting `role="alert"` onto every one of six screens by remembering it six
 * times is how five of them get it.
 *
 * The busy state matters for the same reason. Disabling the button without
 * saying anything leaves a keyboard user with no feedback at all, so the label
 * changes too.
 */

export type AuthFormProps = {
  title: string;
  /** Sits under the title. Keep it to one sentence. */
  description?: string;
  submitLabel: string;
  /** Shown on the button while the request is in flight. */
  busyLabel?: string;
  /** Rejecting with an Error surfaces its message; resolving clears the form. */
  onSubmit: () => Promise<void>;
  /** Rendered under the form — "Already have an account?" and friends. */
  footer?: ReactNode;
  children: ReactNode;
};

export function AuthForm({
  title,
  description,
  submitLabel,
  busyLabel = "Working…",
  onSubmit,
  footer,
  children,
}: AuthFormProps) {
  const headingId = useId();
  const errorId = useId();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setIsBusy(true);
    try {
      await onSubmit();
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "Something went wrong. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-[26rem] p-8">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        aria-labelledby={headingId}
        // The error is described by the FORM, so a screen reader reaching any
        // control still learns the submission failed.
        aria-describedby={error === undefined ? undefined : errorId}
        noValidate
      >
        <h1
          id={headingId}
          className="font-display text-[length:var(--text-h2)] font-bold text-[var(--text-primary)]"
        >
          {title}
        </h1>
        {description !== undefined && (
          <p className="mt-2 text-[length:var(--text-body)] text-[var(--text-secondary)]">
            {description}
          </p>
        )}

        {error !== undefined && (
          // role="alert" is the whole point: without it the message renders and
          // is never announced, so a screen-reader user submits and nothing
          // appears to happen.
          <div
            id={errorId}
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-err-bg)] p-3 text-[length:var(--text-small)] text-[var(--status-err)]"
          >
            <CircleAlert
              width={16}
              height={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4">{children}</div>

        <Button type="submit" className="mt-6 w-full" disabled={isBusy}>
          {isBusy ? busyLabel : submitLabel}
        </Button>
      </form>

      {footer !== undefined && (
        <div className="mt-6 text-center text-[length:var(--text-small)] text-[var(--text-secondary)]">
          {footer}
        </div>
      )}
    </Card>
  );
}
