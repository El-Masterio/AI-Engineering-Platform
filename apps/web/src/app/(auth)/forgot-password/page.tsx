"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, Input } from "@atelier/ui";
import { AuthForm } from "@/components/auth-form";
import { authClient } from "@/lib/auth-client";
import { messageFor } from "@/lib/auth-errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSent, setIsSent] = useState(false);

  if (isSent) {
    return (
      <div className="w-full max-w-[26rem] text-center">
        <h1 className="font-display text-[length:var(--text-h2)] font-bold text-[var(--text-primary)]">
          Check your email
        </h1>
        {/*
          Deliberately says nothing about whether the address exists. The server
          answers identically either way (M014), and a UI that said "we could
          not find that account" would reintroduce the enumeration oracle the
          server was careful to avoid.
        */}
        <p className="mt-3 text-[length:var(--text-body)] text-[var(--text-secondary)]">
          If that address has an account, a reset link is on its way. The link works once and
          expires in an hour.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-block text-[length:var(--text-small)] text-[var(--text-link)] underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <AuthForm
      title="Reset your password"
      description="We will email you a link."
      submitLabel="Send reset link"
      busyLabel="Sending…"
      onSubmit={async () => {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        if (error) throw new Error(messageFor(error, "Could not send the reset link."));
        setIsSent(true);
      }}
      footer={
        <Link href="/sign-in" className="text-[var(--text-link)] underline">
          Back to sign in
        </Link>
      }
    >
      <Field label="Email">
        {(field) => (
          <Input
            {...field}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        )}
      </Field>
    </AuthForm>
  );
}
