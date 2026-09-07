import { PGlite } from '@electric-sql/pglite'
import { expect, it, vi } from 'vitest'

import {
  type PluginData,
  type PluginRuntimeContext,
  unavailablePluginRuntime,
} from '@meith/plugin-kit'

import { calendarPlugin } from './definition'
import { REMINDER_BATCH, sendReminders } from './reminders'
import { CALENDAR_MIGRATIONS } from './schema'

it('declares the cron schedule and notification preference', () => {
  expect(calendarPlugin.tasks).toContainEqual({
    id: 'reminders',
    schedule: '*/5 * * * *',
    run: sendReminders,
  })
  expect(calendarPlugin.notifications).toEqual([
    expect.objectContaining({ key: 'reminder', emailByDefault: false }),
  ])
})

it('delivers once per valid occurrence, catches up, retries failures and bounds each run', async () => {
  const db = new PGlite()
  try {
    for (const migration of CALENDAR_MIGRATIONS) {
      for (const statement of migration.statements) await db.exec(statement)
    }
    const data: PluginData = {
      async query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
        return (await db.query<T>(sql, [...params])).rows
      },
      async one<T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
        return (await data.query<T>(sql, params))[0] ?? null
      },
      async tx(work) {
        return work(data)
      },
    }
    const send = vi.fn<PluginRuntimeContext['notify']['send']>().mockResolvedValue(undefined)
    const context: PluginRuntimeContext = {
      ...unavailablePluginRuntime('test'),
      data,
      notify: { send },
      users: {
        async byId(userId) {
          return userId === 99 ? null : { userId, username: 'member' + userId }
        },
        async byUsername() {
          return null
        },
      },
    }
    await db.exec(`insert into plugin_calendar_event (title, starts_at, repeat, repeat_until)
      values ('Training', '2026-09-07T19:00:00Z', 'weekly', '2026-09-14');
      insert into plugin_calendar_rsvps (event_id, occurrence_date, user_id, status) values
      (1, '2026-09-07', 1, 'yes'), (1, '2026-09-07', 2, 'maybe'),
      (1, '2026-09-07', 3, 'no'), (1, '2026-09-07', 99, 'yes'),
      (1, '2026-09-08', 1, 'yes'), (1, '2026-09-14', 1, 'yes'),
      (1, '2026-09-21', 1, 'yes')`)
    await sendReminders(context, new Date('2026-09-07T16:59:59Z'))
    expect(send).not.toHaveBeenCalled()
    await sendReminders(context, new Date('2026-09-07T17:00:00Z'))
    expect(send.mock.calls.map(([input]) => input.userId)).toEqual([1, 2])
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'reminder',
        subjectKey: 'calendar.reminder.subject',
        subjectArgs: { title: 'Training' },
        href: '/plugins/calendar?event=1&occurrence=2026-09-07',
        dedupeKey: 'calendar.reminder:1:2026-09-07',
      }),
    )
    await sendReminders(context, new Date('2026-09-07T17:05:00Z'))
    expect(send).toHaveBeenCalledTimes(2)
    await db.exec(`delete from plugin_calendar_rsvps where user_id = 1 and occurrence_date = '2026-09-07';
      insert into plugin_calendar_rsvps (event_id, occurrence_date, user_id, status)
      values (1, '2026-09-07', 1, 'maybe'), (1, '2026-09-07', 4, 'yes')`)
    send.mockRejectedValueOnce(new Error('notification unavailable'))
    await expect(sendReminders(context, new Date('2026-09-07T18:00:00Z'))).rejects.toThrow(
      'notification unavailable',
    )
    await sendReminders(context, new Date('2026-09-07T18:05:00Z'))
    expect(send.mock.calls.map(([input]) => input.userId)).toEqual([1, 2, 4, 4])
    await db.exec(`insert into plugin_calendar_rsvps (event_id, occurrence_date, user_id, status)
      values (1, '2026-09-07', 5, 'yes')`)
    await sendReminders(context, new Date('2026-09-07T19:00:00Z'))
    expect(send).toHaveBeenCalledTimes(4)
    await sendReminders(context, new Date('2026-09-14T18:00:00Z'))
    expect(send).toHaveBeenCalledTimes(5)
    await sendReminders(context, new Date('2026-09-21T18:00:00Z'))
    expect(send).toHaveBeenCalledTimes(5)
    await sendReminders(
      { ...context, settings: { reminder_hours: 0 } },
      new Date('2026-09-07T18:00:00Z'),
    )
    expect(send).toHaveBeenCalledTimes(5)
    for (const reminder_hours of [-1, 169, Number.NaN, '2']) {
      await expect(sendReminders({ ...context, settings: { reminder_hours } })).rejects.toThrow(
        'reminder_hours',
      )
    }
    await db.exec(`insert into plugin_calendar_event (title, starts_at) values ('Meetup', '2026-10-01T00:30:00Z');
      insert into plugin_calendar_rsvps (event_id, occurrence_date, user_id, status)
      select 2, '2026-10-01', n, 'yes' from generate_series(1000, 1100) n`)
    send.mockClear()
    await sendReminders(context, new Date('2026-09-30T23:00:00Z'))
    expect(send).toHaveBeenCalledTimes(REMINDER_BATCH)
    await sendReminders(context, new Date('2026-09-30T23:05:00Z'))
    expect(send).toHaveBeenCalledTimes(REMINDER_BATCH + 1)
    await db.exec('delete from plugin_calendar_event')
    expect((await db.query('select * from plugin_calendar_reminders')).rows).toEqual([])
  } finally {
    await db.close()
  }
})
