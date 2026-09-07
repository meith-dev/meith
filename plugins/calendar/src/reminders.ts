import type { PluginRuntimeContext } from '@meith/plugin-kit'

import { occurrenceHref } from './events'
import en from './messages/en.json'
import { windowEvents } from './store'

export const REMINDER_BATCH = 100

export async function sendReminders(
  context: PluginRuntimeContext,
  now = new Date(),
): Promise<void> {
  const hours = context.settings.reminder_hours ?? 2
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 168) {
    throw new Error(en['calendar.error.reminderHours'])
  }
  if (hours === 0) return
  const events = await windowEvents(
    context.data,
    new Date(now.getTime() + 1),
    new Date(now.getTime() + hours * 3_600_000 + 1),
  )
  let remaining = REMINDER_BATCH
  for (const event of events) {
    const day = event.startsAt.toISOString().slice(0, 10)
    const recipients = await context.data.query<{ user_id: number }>(
      `select r.user_id from plugin_calendar_rsvps r
       where r.event_id = $1 and r.occurrence_date = $2 and r.status in ('yes', 'maybe')
         and not exists (
           select 1 from plugin_calendar_reminders s
           where s.event_id = r.event_id and s.occurrence_date = r.occurrence_date
             and s.user_id = r.user_id
         )
       order by r.user_id limit $3`,
      [event.id, day, remaining],
    )
    for (const { user_id: userId } of recipients) {
      if ((await context.users.byId(userId)) !== null) {
        await context.notify.send({
          userId,
          kind: 'reminder',
          subjectKey: 'calendar.reminder.subject',
          subjectArgs: { title: event.title },
          bodyKey: 'calendar.reminder.body',
          bodyArgs: { startsAt: event.startsAt.toISOString().slice(0, 16).replace('T', ' ') },
          href: occurrenceHref(event),
          dedupeKey: `calendar.reminder:${event.id}:${day}`,
        })
      }
      await context.data.query(
        `insert into plugin_calendar_reminders (event_id, occurrence_date, user_id)
         values ($1, $2, $3) on conflict do nothing`,
        [event.id, day, userId],
      )
      remaining--
      if (remaining === 0) return
    }
  }
}
