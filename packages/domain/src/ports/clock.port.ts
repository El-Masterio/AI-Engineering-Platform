/**
 * The clock, as a port.
 *
 * §21 forbids `Date.now()` in domain code and the lint rules enforce it. The
 * reason is not purity for its own sake: a rule like "a trial expires 14 days
 * after signup" is untestable when the entity reads the wall clock, and becomes
 * three lines of arithmetic when time is passed in.
 *
 * Time is epoch milliseconds rather than a `Date`. `Date` is mutable, carries a
 * timezone that means nothing here, and compares by reference — all of which
 * are ways for a domain rule to go subtly wrong.
 */

declare const timestampBrand: unique symbol;

/** Milliseconds since the Unix epoch, UTC. */
export type Timestamp = number & { readonly [timestampBrand]: "Timestamp" };

export function toTimestamp(milliseconds: number): Timestamp {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new TypeError(`Not a valid timestamp: ${milliseconds}`);
  }
  return milliseconds as Timestamp;
}

export type Clock = {
  now: () => Timestamp;
};

/**
 * A clock that does not move.
 *
 * The default for tests: a rule that behaves differently on the second run is
 * a rule nobody trusts.
 */
export function fixedClock(at: Timestamp): Clock {
  return { now: () => at };
}
