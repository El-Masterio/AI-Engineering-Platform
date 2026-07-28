/**
 * Log redaction (NFR-OBS-2: "no secrets, no PII, no customer source code in
 * logs"; §17: "a secret-shaped string in a log is a P1 incident with rotation").
 *
 * Two layers, because they fail differently.
 *
 *   **By key** — `password`, `authorization`, `apiKey`. Catches the fields we
 *   already know about. Cheap, exact, and useless against anything unforeseen.
 *
 *   **By shape** — `sk-ant-…`, `ghp_…`, a JWT, a `postgres://` URL with
 *   credentials in it. Catches the case that actually happens: nobody logs
 *   `{ password }` on purpose, they log an error object whose message embeds a
 *   connection string, or a request body they never inspected.
 *
 * Key-based alone is the comfortable option and the one that leaks. A leak is
 * unrecoverable — the credential is in a log aggregator, replicated, retained,
 * and rotation is now an incident — so this errs toward redacting too much.
 */

export const REDACTED = "[REDACTED]";

/**
 * Words that make a field sensitive whatever its value.
 *
 * Matched against WORDS rather than by substring. `authorId` must not be
 * redacted because it happens to start with "auth", and a regex over the raw
 * key either misses `sessionToken` (no separator before "token") or over-matches
 * `author`. Splitting the key into words first makes both cases obvious.
 */
const SENSITIVE_WORDS = new Set([
  "auth",
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "dsn",
  "otp",
  "passwd",
  "password",
  "pin",
  "secret",
  "session",
  "signature",
  "ssn",
  "token",
]);

/** Word PAIRS that are sensitive only together — `api` and `key` are not. */
const SENSITIVE_WORD_PAIRS = new Set([
  "apikey",
  "accesskey",
  "privatekey",
  "publickey",
  "secretkey",
  "connectionstring",
]);

/** `X-Api-Key` / `apiKey` / `api_key` → ["x", "api", "key"]. */
function splitKeyIntoWords(key: string): string[] {
  return key
    .replaceAll(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[\s.:_-]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

/**
 * Value shapes that must never appear in a log, whatever field they arrive in.
 *
 * Deliberately specific: a pattern broad enough to catch "any long random
 * string" would redact run ids, trace ids and content hashes, and a log where
 * everything is [REDACTED] gets turned off.
 */
const SENSITIVE_VALUE_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "anthropic-key", pattern: /\bsk-ant-[\w-]{8,}/g },
  { name: "openai-key", pattern: /\bsk-(?!ant-)[A-Za-z0-9]{20,}/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}/g },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "slack-token", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  {
    name: "private-key-block",
    pattern: /-----BEGIN[ A-Z]*PRIVATE KEY-----[\S\s]*?-----END[ A-Z]*PRIVATE KEY-----/g,
  },
  { name: "bearer", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi },
  // A URL carrying credentials: postgres://user:password@host. The password is
  // the point; the rest of the URL is useful, so only the userinfo is removed.
  { name: "url-credentials", pattern: /\b([a-z][\w+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi },
];

/** PII shapes. Narrow on purpose — see the note on over-redaction above. */
const PII_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "email", pattern: /\b[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi },
];

export type RedactionOptions = {
  /** Redact email addresses too. On by default; off for tests that assert on them. */
  redactPii?: boolean;
  /** Guards against a cyclic or pathologically deep object. */
  maxDepth?: number;
};

/** Replace every secret-shaped substring in one string. */
export function redactString(value: string, options: RedactionOptions = {}): string {
  const { redactPii = true } = options;
  let out = value;

  for (const { pattern } of SENSITIVE_VALUE_PATTERNS) {
    // `url-credentials` keeps the scheme so the host stays debuggable.
    out = out.replaceAll(pattern, (_match: string, scheme: string | undefined) =>
      scheme === undefined ? REDACTED : `${scheme}${REDACTED}@`,
    );
  }
  if (redactPii) {
    for (const { pattern } of PII_PATTERNS) {
      // REDACTED is a module constant containing no `$` sequences, so there is
      // nothing for the replacement to reinterpret.
      // eslint-disable-next-line unicorn/no-unsafe-string-replacement -- justified: see above
      out = out.replaceAll(pattern, REDACTED);
    }
  }
  return out;
}

/** True when a field name means "the value is a secret, whatever it looks like". */
export function isSensitiveKey(key: string): boolean {
  const words = splitKeyIntoWords(key);
  if (words.some((word) => SENSITIVE_WORDS.has(word))) return true;

  for (const [index, word] of words.entries()) {
    const next = words[index + 1];
    if (next !== undefined && SENSITIVE_WORD_PAIRS.has(`${word}${next}`)) return true;
  }
  return false;
}

/**
 * Redact a whole log payload.
 *
 * Returns a new structure; the caller's object is never mutated, because a
 * logger that edits what you passed it is a logger that changes program
 * behaviour depending on whether logging is enabled.
 */
export function redact(value: unknown, options: RedactionOptions = {}): unknown {
  const { maxDepth = 8 } = options;
  const seen = new WeakSet<object>();

  function walk(node: unknown, depth: number): unknown {
    if (depth > maxDepth) return "[Object: max depth]";
    if (typeof node === "string") return redactString(node, options);
    if (node === null || typeof node !== "object") return node;

    if (seen.has(node)) return "[Circular]";
    seen.add(node);

    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));

    // Errors do not serialise through Object.entries; take the useful fields
    // and redact the message, which is where a connection string usually hides.
    if (node instanceof Error) {
      return {
        name: node.name,
        message: redactString(node.message, options),
        ...(node.stack !== undefined && { stack: redactString(node.stack, options) }),
      };
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(node)) {
      out[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1);
    }
    return out;
  }

  return walk(value, 0);
}
