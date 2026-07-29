import type { ReactNode } from "react";

/**
 * The auth screens sit outside the dashboard shell.
 *
 * Deliberately: the sidebar, org switcher and user menu all assume a session,
 * and rendering them around a sign-in form means every one of them has to
 * handle "no session" — six components carrying a branch for a state that only
 * exists on two screens.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-base)] p-6">
      {children}
    </main>
  );
}
