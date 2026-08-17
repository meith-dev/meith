export interface Clock {
  now(): Date
  nowMs(): number
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
}

export function fixedClock(
  start: Date | number,
): Clock & { advance(ms: number): void; set(value: Date | number): void } {
  let current = typeof start === 'number' ? start : start.getTime()
  return {
    now: () => new Date(current),
    nowMs: () => current,
    advance(ms: number) {
      current += ms
    },
    set(value: Date | number) {
      current = typeof value === 'number' ? value : value.getTime()
    },
  }
}
