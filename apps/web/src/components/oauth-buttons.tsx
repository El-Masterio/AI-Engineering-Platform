"use client";

import { useState } from "react";
import { Button } from "@atelier/ui";
import { authClient } from "@/lib/auth-client";
import { messageFor } from "@/lib/auth-errors";

/**
 * GitHub and Google sign-in (FR-AUTH-2).
 *
 * Both providers are rendered unconditionally. M014's env schema refuses HALF a
 * provider — an id without its secret — so a configured deployment has both
 * halves or neither, and a button that leads to a misconfigured provider is a
 * server-side failure rather than something to hide here.
 *
 * The redirect never resolves on success: the browser leaves. So the busy state
 * is not cleared on the happy path, which is correct — re-enabling the button
 * during the navigation invites a second click that starts a second flow.
 */
export function OAuthButtons({ label }: { label: string }) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<"github" | "google" | undefined>(undefined);

  async function start(provider: "github" | "google"): Promise<void> {
    setError(undefined);
    setBusy(provider);
    try {
      const { error: failure } = await authClient.signIn.social({
        provider,
        callbackURL: "/",
      });
      if (failure) throw new Error(messageFor(failure, `Could not continue with ${provider}.`));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : `Could not continue with ${provider}.`);
      setBusy(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-[length:var(--text-small)] text-[var(--text-tertiary)]">
        {label}
      </p>

      {error !== undefined && (
        <p
          role="alert"
          className="text-center text-[length:var(--text-small)] text-[var(--status-err)]"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {(["github", "google"] as const).map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="secondary"
            className="flex-1 capitalize"
            disabled={busy !== undefined}
            onClick={() => {
              void start(provider);
            }}
          >
            {busy === provider ? "Redirecting…" : provider}
          </Button>
        ))}
      </div>
    </div>
  );
}
