import { describe, expect, it } from "vitest";
import { fixedClock, toTimestamp } from "./clock.port.js";

describe("toTimestamp", () => {
  it("accepts a non-negative safe integer", () => {
    expect(toTimestamp(0)).toBe(0);
    expect(toTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it.each([-1, 1.5, NaN, Infinity])("rejects %s", (value) => {
    expect(() => toTimestamp(value)).toThrow(TypeError);
  });
});

describe("fixedClock", () => {
  it("does not move", () => {
    // A rule that behaves differently on the second run is a rule nobody
    // trusts — which is the whole reason time is injected rather than read.
    const clock = fixedClock(toTimestamp(1_700_000_000_000));
    expect(clock.now()).toBe(clock.now());
  });
});
