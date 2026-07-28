import { describe, expect, it } from "vitest";
import { healthStatusCode, liveness, readiness } from "./health.js";

describe("liveness", () => {
  /**
   * Liveness must not check dependencies. If it did, a database blip would fail
   * every replica's probe at once and the orchestrator would restart the whole
   * fleet — turning a recoverable dependency problem into an outage.
   */
  it("passes with no checks at all", () => {
    const report = liveness();
    expect(report.status).toBe("pass");
    expect(report.checks).toEqual([]);
    expect(healthStatusCode(report)).toBe(200);
  });
});

describe("readiness", () => {
  it("passes when every dependency passes", async () => {
    const report = await readiness([
      { name: "database", probe: async () => {} },
      { name: "cache", probe: async () => {} },
    ]);

    expect(report.status).toBe("pass");
    expect(healthStatusCode(report)).toBe(200);
    expect(report.checks.map((c) => c.name)).toEqual(["database", "cache"]);
  });

  it("fails with 503 when one dependency fails, and says which", async () => {
    const report = await readiness([
      { name: "database", probe: async () => {} },
      { name: "cache", probe: () => Promise.reject(new Error("ECONNREFUSED")) },
    ]);

    expect(report.status).toBe("fail");
    expect(healthStatusCode(report)).toBe(503);
    expect(report.checks.find((c) => c.name === "cache")?.status).toBe("fail");
    expect(report.checks.find((c) => c.name === "database")?.status).toBe("pass");
  });

  it("never leaks a driver message into the report", async () => {
    // A Postgres connection error carries the connection string (§17).
    const report = await readiness([
      {
        name: "database",
        probe: () => Promise.reject(new Error("connect failed postgresql://u:hunter2@db/app")),
      },
    ]);

    expect(JSON.stringify(report)).not.toContain("hunter2");
    expect(report.checks[0]?.detail).toBe("check failed");
  });

  it("times out a hung dependency instead of hanging the probe", async () => {
    const report = await readiness([
      { name: "slow", probe: () => new Promise(() => {}), timeoutMs: 50 },
    ]);

    expect(report.status).toBe("fail");
    expect(report.checks[0]?.detail).toContain("timed out");
  });

  it("runs checks in parallel, not in series", async () => {
    const startedAt = performance.now();
    await readiness([
      { name: "a", probe: () => new Promise((r) => setTimeout(r, 60)) },
      { name: "b", probe: () => new Promise((r) => setTimeout(r, 60)) },
      { name: "c", probe: () => new Promise((r) => setTimeout(r, 60)) },
    ]);

    // Serial would be ~180ms. The bound is generous so this is not a flaky
    // timing test, but it still catches an accidental sequential await.
    expect(performance.now() - startedAt).toBeLessThan(150);
  });
});

describe("a failing check reports the reason to the operator, not to the wire", () => {
  it("hands the real error to onError while the body stays generic", async () => {
    const seen: unknown[] = [];
    const report = await readiness([
      {
        name: "database",
        probe: () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.1:5432")),
        onError: (error) => {
          seen.push(error);
        },
      },
    ]);

    // The operator gets everything...
    expect(seen).toHaveLength(1);
    expect((seen[0] as Error).message).toContain("ECONNREFUSED");

    // ...and the unauthenticated caller gets nothing useful (§17).
    expect(report.status).toBe("fail");
    expect(JSON.stringify(report)).not.toContain("ECONNREFUSED");
    expect(report.checks[0]?.detail).toBe("check failed");
  });

  it("is not called when the check passes", async () => {
    let calls = 0;
    await readiness([{ name: "db", probe: () => Promise.resolve(), onError: () => calls++ }]);
    expect(calls).toBe(0);
  });

  it("survives an onError that itself throws", async () => {
    // A broken logger must degrade the diagnosis, never the probe.
    const report = await readiness([
      {
        name: "db",
        probe: () => Promise.reject(new Error("down")),
        onError: () => {
          throw new Error("logger exploded");
        },
      },
    ]);
    expect(report.status).toBe("fail");
  });
});
