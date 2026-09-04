export type BackupFrequency = 'off' | 'daily' | 'weekly'

export interface BackupSchedule {
  readonly frequency: BackupFrequency
  readonly hour: number
  readonly minute: number
  readonly weekday: number
}

export const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseScheduleTime(value: string): { hour: number; minute: number } | null {
  const match = SCHEDULE_TIME_PATTERN.exec(value.trim())
  if (match === null) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

export function formatScheduleTime(schedule: { hour: number; minute: number }): string {
  return `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
}

const DAY_MS = 24 * 60 * 60 * 1000

function slotOnDay(day: Date, schedule: BackupSchedule): Date {
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      schedule.hour,
      schedule.minute,
    ),
  )
}

export function latestSlotAtOrBefore(schedule: BackupSchedule, now: Date): Date | null {
  if (schedule.frequency === 'off') return null

  for (let back = 0; back < 8; back += 1) {
    const day = new Date(now.getTime() - back * DAY_MS)
    if (schedule.frequency === 'weekly' && day.getUTCDay() !== schedule.weekday) continue
    const slot = slotOnDay(day, schedule)
    if (slot.getTime() <= now.getTime()) return slot
  }
  return null
}

export function nextSlotAfter(schedule: BackupSchedule, from: Date): Date | null {
  if (schedule.frequency === 'off') return null

  for (let ahead = 0; ahead < 8; ahead += 1) {
    const day = new Date(from.getTime() + ahead * DAY_MS)
    if (schedule.frequency === 'weekly' && day.getUTCDay() !== schedule.weekday) continue
    const slot = slotOnDay(day, schedule)
    if (slot.getTime() > from.getTime()) return slot
  }
  return null
}

export function scheduledBackupDue(
  schedule: BackupSchedule,
  input: {
    readonly now: Date
    readonly lastTickAt: Date | null
    readonly lastScheduledAt: Date | null
  },
): Date | null {
  const slot = latestSlotAtOrBefore(schedule, input.now)
  if (slot === null) return null
  if (input.lastTickAt === null || slot.getTime() <= input.lastTickAt.getTime()) return null
  if (input.lastScheduledAt !== null && input.lastScheduledAt.getTime() >= slot.getTime()) {
    return null
  }
  return slot
}
