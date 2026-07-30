/**
 * Time is injected, never read ambiently from `Date.now()` inside domain logic.
 *
 * This exists because several acceptance criteria are statements about time:
 * "no more than one write per 60s per session" (F17), "restores the prior group on
 * expiry" (F23), "loops missed periods and caps the catch-up window" (F06). Those
 * are only testable if the test controls the clock.
 */
export interface Clock {
  now(): Date
  nowMs(): number
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
}

/** A clock frozen at `start`, advanceable by tests. */
export function fixedClock(start: Date | number): Clock & { advance(ms: number): void; set(value: Date | number): void } {
  let current = typeof start === "number" ? start : start.getTime()
  return {
    now: () => new Date(current),
    nowMs: () => current,
    advance(ms: number) {
      current += ms
    },
    set(value: Date | number) {
      current = typeof value === "number" ? value : value.getTime()
    },
  }
}
