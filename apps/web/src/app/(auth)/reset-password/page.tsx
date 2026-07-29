"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Field, Input } from "@atelier/ui";
import { AuthForm } from "@/components/auth-form";
import { authClient } from "@/lib/auth-client";
import { messageFor } from "@/lib/auth-errors";

const MIN_PASSWORD_LENGTH = 12;

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  if (token === "") {
    return (
      <div className="w-full max-w-[26rem] text-center">
        <h1 className="font-display text-[length:var(--text-h2)] font-bold text-[var(--text-primary)]">
          That link is not valid
        </h1>
        <p className="mt-3 text-[length:var(--text-body)] text-[var(--text-secondary)]">
          Reset links work once and expire after an hour. Ask for a new one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-[length:var(--text-small)] text-[var(--text-link)] underline"
        >
          Send a new link
        </Link>
      </div>
    );
  }

  const mismatch =
    confirmation !== "" && confirmation !== password ? "The passwords do not match." : undefined;

  return (
    <AuthForm
      title="Choose a new password"
      submitLabel="Set password"
      busyLabel="Saving…"
      onSubmit={async () => {
        // Checked here as well as by the disabled state, because a form can be
        // submitted with Enter from a field that never blurred.
        if (password !== confirmation) throw new Error("The passwords do not match.");

        const { error } = await authClient.resetPassword({ newPassword: password, token });
        if (error) throw new Error(messageFor(error, "Could not reset your password."));

        // Every existing session was revoked server-side (FR-AUTH-5), so there
        // is nothing to return to but sign-in.
        router.push("/sign-in");
      }}
    >
      <Field label="New password" description={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        )}
      </Field>

      <Field label="Confirm new password" {...(mismatch !== undefined && { error: mismatch })}>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
            }}
          />
        )}
      </Field>
    </AuthForm>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary, or the whole route opts out of
  // static rendering and Next fails the build.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
