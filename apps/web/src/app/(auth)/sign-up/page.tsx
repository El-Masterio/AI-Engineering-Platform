"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Input } from "@atelier/ui";
import { AuthForm } from "@/components/auth-form";
import { OAuthButtons } from "@/components/oauth-buttons";
import { authClient } from "@/lib/auth-client";
import { messageFor } from "@/lib/auth-errors";

/** M014's server floor. Stated here so the message can be shown before submitting. */
const MIN_PASSWORD_LENGTH = 12;

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const passwordError =
    password !== "" && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : undefined;

  return (
    <div className="flex w-full max-w-[26rem] flex-col gap-6">
      <AuthForm
        title="Create your account"
        description="You will get your own workspace to start in."
        submitLabel="Create account"
        busyLabel="Creating…"
        onSubmit={async () => {
          const { error } = await authClient.signUp.email({ email, password, name });
          if (error) throw new Error(messageFor(error, "Could not create your account."));
          router.push("/verify-email");
        }}
        footer={
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-[var(--text-link)] underline">
              Sign in
            </Link>
          </>
        }
      >
        <Field label="Name">
          {(field) => (
            <Input
              {...field}
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>

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

        <Field
          label="Password"
          description={`At least ${MIN_PASSWORD_LENGTH} characters. Length beats punctuation.`}
          {...(passwordError !== undefined && { error: passwordError })}
        >
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
      </AuthForm>

      <OAuthButtons label="Or continue with" />
    </div>
  );
}
