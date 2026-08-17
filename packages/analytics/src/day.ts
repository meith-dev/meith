export type DayKey = string

const DAY_MS = 86_400_000

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function dayKey(at: Date): DayKey {
  return at.toISOString().slice(0, 10)
}

export function isDayKey(value: string): boolean {
  const parts = DAY_PATTERN.exec(value)
  if (parts === null) return false
  return dayKey(startOfDay(value)) === value
}

export function startOfDay(day: DayKey): Date {
  const parts = DAY_PATTERN.exec(day)
  if (parts === null) return new Date(Number.NaN)

  return new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])),
  )
}

export function shiftDay(day: DayKey, by: number): DayKey {
  return dayKey(new Date(startOfDay(day).getTime() + by * DAY_MS))
}

export function retentionCutoff(input: {
  readonly now: Date
  readonly retentionDays: number
}): DayKey {
  return shiftDay(dayKey(input.now), -Math.max(1, Math.trunc(input.retentionDays)))
}

export function dayRange(input: {
  readonly to: DayKey
  readonly days: number
}): readonly DayKey[] {
  const count = Math.max(1, Math.trunc(input.days))
  const out: DayKey[] = []

  for (let index = count - 1; index >= 0; index -= 1) {
    out.push(shiftDay(input.to, -index))
  }

  return out
}
