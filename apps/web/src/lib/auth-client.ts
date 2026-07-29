"use client";

import { createAuthClient } from "better-auth/react";

/**
 * The browser's view of authentication (M014's server, M022's screens).
 *
 * `baseURL` is read from the environment rather than hardcoded, and the
 * fallback is same-origin: in production the API and the dashboard are served
 * from one origin, and a wrong absolute URL here means the session cookie is
 * set for a host the browser will not send it back to — which presents as
 * "sign-in succeeds and then I am logged out", the least debuggable failure in
 * the whole flow.
 */
export const authClient = createAuthClient({
  baseURL: process.env["NEXT_PUBLIC_AUTH_URL"] ?? "",
});

// Only `useSession` is re-exported. The rest are reached through
// `authClient` at the call site, so there is one obvious way to call them.
export const { useSession } = authClient;
