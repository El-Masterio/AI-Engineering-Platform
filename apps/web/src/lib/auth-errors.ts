/**
 * Turn an auth failure into something safe to show.
 *
 * §16 requires the API's message to be safe to display and free of internals,
 * and M014 deliberately makes sign-in failures generic so the form cannot be
 * used to enumerate accounts. Both of those only hold if the UI SHOWS what the
 * server sent rather than inventing a friendlier version — a client that maps
 * "invalid credentials" to "no account with that email" reintroduces the
 * enumeration oracle the server was careful to avoid.
 *
 * So this function is deliberately not a mapping table. It prefers the server's
 * message, and falls back only when there is nothing to show.
 */
export function messageFor(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (typeof error === "string" && error.trim() !== "") return error;

  const candidate = error as { message?: unknown; error?: { message?: unknown } } | null;
  const message = candidate?.error?.message ?? candidate?.message;

  return typeof message === "string" && message.trim() !== "" ? message : fallback;
}
