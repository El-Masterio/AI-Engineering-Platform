import type { Action } from "./actions.js";

/**
 * API-key scopes (§16), and the actions each one grants.
 *
 * A scope is a BUNDLE of actions, not an alias for one. §16 lists seven scopes
 * — `projects:read`, `projects:write`, `runs:start`, `runs:read`,
 * `memory:write`, `costs:read`, `audit:read` — and they are deliberately
 * coarser than the action catalogue: `projects:write` covers creating,
 * updating, archiving and deleting, because a key holder reasons about "may
 * this key change projects?" rather than about four verbs.
 *
 * M017 assumed these were the same vocabulary and checked
 * `scopes.includes(action)` directly. They are not: the scopes are plural and
 * coarse, the actions singular and fine, so a key scoped `projects:write` would
 * have been refused `project:create` — every key would have failed for every
 * write it was created to perform. Corrected here rather than by renaming the
 * actions, because the coarse names are the ones a customer sees.
 */

export const SCOPES = [
  "projects:read",
  "projects:write",
  "runs:read",
  "runs:start",
  "memory:read",
  "memory:write",
  "costs:read",
  "audit:read",
] as const;

export type Scope = (typeof SCOPES)[number];

const SCOPE_ACTIONS: Readonly<Record<Scope, readonly Action[]>> = Object.freeze({
  "projects:read": ["organization:read", "project:read", "plan:read"],
  "projects:write": ["project:create", "project:update", "project:archive", "project:delete"],
  "runs:read": ["run:read"],
  "runs:start": ["run:start", "run:interrupt"],
  "memory:read": ["memory:read"],
  "memory:write": ["memory:write"],
  "costs:read": ["cost:read"],
  "audit:read": ["audit:read"],
});

export function isScope(value: unknown): value is Scope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

/**
 * Does this set of scopes permit this action?
 *
 * An unknown scope grants nothing rather than throwing — a key carrying a scope
 * from a future release must degrade to less access, never to an error that
 * takes the caller's whole request down.
 */
export function isGrantedByScopes(scopes: readonly string[], action: Action): boolean {
  return scopes.some((scope) => isScope(scope) && SCOPE_ACTIONS[scope].includes(action));
}

/**
 * The default scopes for a new key.
 *
 * §16: "Least privilege by default; a new key gets read-only unless asked."
 */
export const DEFAULT_SCOPES: readonly Scope[] = Object.freeze([
  "projects:read",
  "runs:read",
  "memory:read",
]);
