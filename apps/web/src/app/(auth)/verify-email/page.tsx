"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@atelier/ui";
import { authClient, useSession } from "@/lib/auth-client";
import { messageFor } from "@/lib/auth-errors";

/**
 * Shown after sign-up (FR-AUTH-4).
 *
 * Verification does NOT block signing in — M014 gates agent runs on it, not
 * access, because a user who mistyped their address at signup could otherwise
 * never get back in to correct it. So this screen informs and offers a resend;
 * it is not a wall.
 */
export default function VerifyEmailPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<{ kind: "idle" | "sent" | "error"; message?: string }>({
    kind: "idle",
  });

  const email = session?.user.email;

  return (
    <div className="w-full max-w-[26rem] text-center">
      <h1 className="font-display text-[length:var(--text-h2)] font-bold text-[var(--text-primary)]">
        Confirm your email
      </h1>
      <p className="mt-3 text-[length:var(--text-body)] text-[var(--text-secondary)]">
        {email === undefined
          ? "We sent you a link. Follow it to finish setting up your account."
          : `We sent a link to ${email}. Follow it to finish setting up your account.`}
      </p>

      {status.kind !== "idle" && (
        <p
          role="status"
          className={
            status.kind === "sent"
              ? "mt-4 text-[length:var(--text-small)] text-[var(--status-ok)]"
              : "mt-4 text-[length:var(--text-small)] text-[var(--status-err)]"
          }
        >
          {status.kind === "sent" ? "Sent. Check your inbox." : status.message}
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        className="mt-6"
        disabled={email === undefined}
        onClick={() => {
          void (async () => {
            if (email === undefined) return;
            const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/" });
            setStatus(
              error
                ? { kind: "error", message: messageFor(error, "Could not resend the email.") }
                : { kind: "sent" },
            );
          })();
        }}
      >
        Resend the email
      </Button>

      <p className="mt-6 text-[length:var(--text-small)] text-[var(--text-tertiary)]">
        You can keep using Atelier meanwhile — confirmation is only needed before an agent run.
      </p>

      <Link
        href="/"
        className="mt-4 inline-block text-[length:var(--text-small)] text-[var(--text-link)] underline"
      >
        Go to your workspace
      </Link>
    </div>
  );
}
