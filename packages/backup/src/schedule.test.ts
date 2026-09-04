import { describe, expect, it } from 'vitest'

import {
  type BackupSchedule,
  formatScheduleTime,
  latestSlotAtOrBefore,
  nextSlotAfter,
  parseScheduleTime,
  scheduledBackupDue,
} from './schedule'

const DAILY: BackupSchedule = { frequency: 'daily', hour: 2, minute: 30, weekday: 0 }
const WEEKLY: BackupSchedule = { frequency: 'weekly', hour: 2, minute: 30, weekday: 1 }
const OFF: BackupSchedule = { frequency: 'off', hour: 2, minute: 30, weekday: 1 }

describe('parseScheduleTime', () => {
  it('reads a 24-hour clock and refuses anything else', () => {
    expect(parseScheduleTime('02:30')).toEqual({ hour: 2, minute: 30 })
    expect(parseScheduleTime(' 23:59 ')).toEqual({ hour: 23, minute: 59 })
    expect(parseScheduleTime('24:00')).toBeNull()
    expect(parseScheduleTime('2:30')).toBeNull()
    expect(parseScheduleTime('02:60')).toBeNull()
    expect(parseScheduleTime('')).toBeNull()
  })

  it('formats back to the same shape', () => {
    expect(formatScheduleTime({ hour: 2, minute: 5 })).toBe('02:05')
  })
})

describe('latestSlotAtOrBefore', () => {
  it('finds today or yesterday for a daily schedule', () => {
    expect(latestSlotAtOrBefore(DAILY, new Date('2026-09-02T12:00:00Z'))).toEqual(
      new Date('2026-09-02T02:30:00Z'),
    )
    expect(latestSlotAtOrBefore(DAILY, new Date('2026-09-02T01:00:00Z'))).toEqual(
      new Date('2026-09-01T02:30:00Z'),
    )
    expect(latestSlotAtOrBefore(DAILY, new Date('2026-09-02T02:30:00Z'))).toEqual(
      new Date('2026-09-02T02:30:00Z'),
    )
  })

  it('finds the most recent weekday for a weekly schedule', () => {
    expect(latestSlotAtOrBefore(WEEKLY, new Date('2026-09-02T12:00:00Z'))).toEqual(
      new Date('2026-08-31T02:30:00Z'),
    )
    expect(latestSlotAtOrBefore(WEEKLY, new Date('2026-08-31T01:00:00Z'))).toEqual(
      new Date('2026-08-24T02:30:00Z'),
    )
  })

  it('is null when the schedule is off', () => {
    expect(latestSlotAtOrBefore(OFF, new Date('2026-09-02T12:00:00Z'))).toBeNull()
    expect(nextSlotAfter(OFF, new Date('2026-09-02T12:00:00Z'))).toBeNull()
  })
})

describe('nextSlotAfter', () => {
  it('steps forward to the next matching moment', () => {
    expect(nextSlotAfter(DAILY, new Date('2026-09-02T02:30:00Z'))).toEqual(
      new Date('2026-09-03T02:30:00Z'),
    )
    expect(nextSlotAfter(WEEKLY, new Date('2026-09-02T12:00:00Z'))).toEqual(
      new Date('2026-09-07T02:30:00Z'),
    )
  })
})

describe('scheduledBackupDue', () => {
  it('fires once when a slot falls between two ticks', () => {
    expect(
      scheduledBackupDue(DAILY, {
        now: new Date('2026-09-02T02:30:20Z'),
        lastTickAt: new Date('2026-09-02T02:29:20Z'),
        lastScheduledAt: new Date('2026-09-01T02:30:10Z'),
      }),
    ).toEqual(new Date('2026-09-02T02:30:00Z'))
  })

  it('does not fire on the first tick after enabling, nor twice for one slot', () => {
    expect(
      scheduledBackupDue(DAILY, {
        now: new Date('2026-09-02T12:00:00Z'),
        lastTickAt: null,
        lastScheduledAt: null,
      }),
    ).toBeNull()
    expect(
      scheduledBackupDue(DAILY, {
        now: new Date('2026-09-02T02:31:20Z'),
        lastTickAt: new Date('2026-09-02T02:30:20Z'),
        lastScheduledAt: null,
      }),
    ).toBeNull()
    expect(
      scheduledBackupDue(DAILY, {
        now: new Date('2026-09-02T02:30:20Z'),
        lastTickAt: new Date('2026-09-02T02:29:20Z'),
        lastScheduledAt: new Date('2026-09-02T02:30:05Z'),
      }),
    ).toBeNull()
  })

  it('catches up once after the scheduler was down over the slot', () => {
    expect(
      scheduledBackupDue(DAILY, {
        now: new Date('2026-09-02T09:00:00Z'),
        lastTickAt: new Date('2026-09-01T23:00:00Z'),
        lastScheduledAt: new Date('2026-09-01T02:30:00Z'),
      }),
    ).toEqual(new Date('2026-09-02T02:30:00Z'))
  })
})
