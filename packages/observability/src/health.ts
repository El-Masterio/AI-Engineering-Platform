/**
 * Health and readiness.
 *
 * Two endpoints because they answer different questions, and conflating them is
 * how a rolling deploy takes a service down:
 *
 *   /healthz   Is this process alive? No dependency checks. A failing database
 *              must NOT fail liveness — the orchestrator would kill and restart
 *              every replica, turning a database blip into an outage.
 *
 *   /readyz    Should this process receive traffic? Checks dependencies. A
 *              failing check removes one replica from the load balancer and
 *              leaves it running, which is recoverable.
 */

export type CheckStatus = "pass" | "fail";

export type CheckResult = {
  name: string;
  status: CheckStatus;
  durationMs: number;
  /** Never include a connection string or a driver error verbatim (§17). */
  detail?: string;
};

export type HealthReport = {
  status: CheckStatus;
  checks: CheckResult[];
};

export type ReadinessCheck = {
  name: string;
  /** Resolve for healthy; throw or reject for unhealthy. */
  probe: () => Promise<void>;
  /** Per-check budget. A hung dependency must not hang the probe. */
  timeoutMs?: number;
};

/** Liveness: the process answered, so it is alive. Deliberately trivial. */
export function liveness(): HealthReport {
  return { status: "pass", checks: [] };
}

async function runCheck(check: ReadinessCheck): Promise<CheckResult> {
  const budget = check.timeoutMs ?? 2000;
  const startedAt = performance.now();

  try {
    await Promise.race([
      check.probe(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${budget}ms`)), budget).unref(),
      ),
    ]);
    return {
      name: check.name,
      status: "pass",
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error: unknown) {
    return {
      name: check.name,
      status: "fail",
      durationMs: Math.round(performance.now() - startedAt),
      // The check's NAME and the fact of failure, never the driver's message —
      // a Postgres connection error contains the connection string.
      detail:
        error instanceof Error && error.message.includes("timed out")
          ? error.message
          : "check failed",
    };
  }
}

/** Readiness: every dependency, in parallel, each with its own timeout. */
export async function readiness(checks: readonly ReadinessCheck[]): Promise<HealthReport> {
  const results = await Promise.all(checks.map((check) => runCheck(check)));
  return {
    status: results.every((r) => r.status === "pass") ? "pass" : "fail",
    checks: results,
  };
}

/** HTTP status for a report: 200 when passing, 503 when not. */
export function healthStatusCode(report: HealthReport): number {
  return report.status === "pass" ? 200 : 503;
}
