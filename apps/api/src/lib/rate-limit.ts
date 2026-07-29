/**
 * Rate limiting (§16), as a sliding window.
 *
 * Fixed windows are simpler and wrong at exactly the moment that matters: a
 * caller limited to 100/min can send 100 at 11:59:59 and 100 more at 12:00:00,
 * so the real ceiling is 200 in one second and the limit only holds on average.
 * The whole point of the control is the burst.
 *
 * The window is therefore a set of timestamps, trimmed to the last `windowMs`
 * on every check. That costs storage proportional to the limit — which is the
 * price of the guarantee, and the reason §16 puts it in Redis rather than in
 * each process's memory.
 */

/** §16's tiers. */
export const RATE_LIMITS = {
  /** Per API key, reads. */
  apiKeyRead: { limit: 1000, windowMs: 60_000 },
  /** Per API key, writes. */
  apiKeyWrite: { limit: 100, windowMs: 60_000 },
  /** Per IP, unauthenticated. */
  anonymous: { limit: 30, windowMs: 60_000 },
} as const;

export type RateLimitTier = keyof typeof RATE_LIMITS;

export type RateLimitDecision = {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Unix seconds when the window frees up — the `RateLimit-Reset` value. */
  readonly resetAt: number;
  /** Seconds to wait. Only meaningful when `allowed` is false. */
  readonly retryAfter: number;
};

/**
 * Where the window lives.
 *
 * A port because the correct implementation depends on how many processes are
 * running: in-memory is right for one and **wrong for several**, since N
 * replicas each keeping their own counter multiply the effective limit by N.
 * That is not a small inaccuracy — it is the limit not existing.
 */
export type RateLimitStore = {
  /**
   * Record a hit and report the state of the window.
   *
   * Must be atomic. A read-modify-write across two round trips lets two
   * concurrent requests both observe "99 used" and both proceed.
   */
  hit: (
    key: string,
    windowMs: number,
    limit: number,
  ) => Promise<{ count: number; resetAt: number }>;
  reset?: (key: string) => Promise<void>;
};

export function decide(
  state: { count: number; resetAt: number },
  limit: number,
): RateLimitDecision {
  const remaining = Math.max(0, limit - state.count);
  const retryAfter = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));

  return {
    // `count` includes the hit being decided, so the limit is reached when the
    // count EXCEEDS it — off by one here means the advertised limit is a lie in
    // one direction or the other.
    allowed: state.count <= limit,
    limit,
    remaining,
    resetAt: Math.ceil(state.resetAt / 1000),
    retryAfter,
  };
}

/**
 * In-memory sliding window.
 *
 * Correct for one process, and the default so a developer needs no Redis to run
 * the app. `createRateLimitPlugin` warns when this is used with `NODE_ENV=production`,
 * because the failure is silent: every replica enforces the limit perfectly and
 * the system as a whole enforces N times it.
 */
export function createMemoryStore(): RateLimitStore & { size: () => number } {
  const windows = new Map<string, number[]>();

  return {
    hit(key, windowMs) {
      const now = Date.now();
      const cutoff = now - windowMs;

      const hits = (windows.get(key) ?? []).filter((at) => at > cutoff);
      hits.push(now);
      windows.set(key, hits);

      return Promise.resolve({
        count: hits.length,
        // The window frees up when its OLDEST hit falls out, not `windowMs`
        // from now — otherwise Retry-After tells a caller to wait far longer
        // than they actually must.
        resetAt: (hits[0] ?? now) + windowMs,
      });
    },
    reset(key) {
      windows.delete(key);
      return Promise.resolve();
    },
    size: () => windows.size,
  };
}

/**
 * Compose the key a window is kept under.
 *
 * Tenant first, and the acceptance criterion is explicit that limits are
 * per-tenant rather than global: a shared key would let one busy customer
 * exhaust the allowance of every other, which is a denial-of-service any
 * customer could trigger by accident.
 */
export function rateLimitKey(parts: {
  tier: RateLimitTier;
  organizationId?: string;
  apiKeyId?: string;
  ip?: string;
}): string {
  const subject = parts.apiKeyId ?? parts.organizationId ?? parts.ip ?? "unknown";
  return `rl:${parts.tier}:${parts.organizationId ?? "anon"}:${subject}`;
}

/** §16: `GET` never mutates, so reads and writes get different allowances. */
export function tierFor(method: string, isAuthenticated: boolean): RateLimitTier {
  if (!isAuthenticated) return "anonymous";
  return method === "GET" || method === "HEAD" ? "apiKeyRead" : "apiKeyWrite";
}
