"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Input } from "@atelier/ui";
import { AuthForm } from "@/components/auth-form";
import { OAuthButtons } from "@/components/oauth-buttons";
import { authClient } from "@/lib/auth-client";
import { messageFor } from "@/lib/auth-errors";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex w-full max-w-[26rem] flex-col gap-6">
      <AuthForm
        title="Sign in"
        description="Welcome back."
        submitLabel="Sign in"
        busyLabel="Signing in…"
        onSubmit={async () => {
          const { error } = await authClient.signIn.email({ email, password });
          // The SERVER's message, not a friendlier one. M014 makes sign-in
          // failures deliberately generic so the form cannot be used to
          // enumerate accounts; rewording it here to "no account with that
          // email" would hand back the oracle the server avoided.
          if (error) throw new Error(messageFor(error, "Could not sign you in."));
          router.push("/");
        }}
        footer={
          <>
            No account?{" "}
            <Link href="/sign-up" className="text-[var(--text-link)] underline">
              Create one
            </Link>
          </>
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

        <Field label="Password">
          {(field) => (
            <Input
              {...field}
              type="password"
              name="password"
              // `current-password`, not `password`: it tells a password manager
              // to offer the saved one rather than to generate a new one.
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          )}
        </Field>

        <Link
          href="/forgot-password"
          className="self-start text-[length:var(--text-small)] text-[var(--text-link)] underline"
        >
          Forgot your password?
        </Link>
      </AuthForm>

      <OAuthButtons label="Or sign in with" />
    </div>
  );
}
