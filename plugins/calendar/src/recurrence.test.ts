import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

import { type PluginData, type PluginRequest, unavailablePluginRuntime } from '@meith/plugin-kit'

import { type CalendarEvent, occurrenceOn, occurrences, readDraft } from './events'
import { handleRsvp } from './handlers'
import { toIcs } from './ics'
import { CALENDAR_MIGRATIONS } from './schema'
import { rsvpSummary, windowEvents } from './store'

const event: CalendarEvent = {
  id: '1',
  title: 'Training',
  startsAt: new Date('2026-01-31T19:00:00Z'),
  endsAt: new Date('2026-01-31T20:00:00Z'),
  location: '',
  threadId: null,
  createdByUserId: 1,
  linkUrl: '',
  linkLabel: '',
  repeat: 'monthly',
}

describe('recurrence', () => {
  it('skips missing month days and keeps duration across boundaries', () => {
    const dates = occurrences(event, new Date('2026-02-01'), new Date('2026-05-01'))
    expect(dates.map((item) => item.startsAt.toISOString())).toEqual(['2026-03-31T19:00:00.000Z'])
    expect(dates[0]?.endsAt?.toISOString()).toBe('2026-03-31T20:00:00.000Z')
    expect(occurrenceOn(event, '2026-02-31')).toBeNull()
  })

  it('includes the until date and excludes the next occurrence', () => {
    const series = { ...event, repeat: 'weekly' as const, repeatUntil: '2026-02-14' }
    expect(
      occurrences(series, new Date('2026-02-01'), new Date('2026-03-01')).map((item) =>
        item.startsAt.toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-02-07', '2026-02-14'])
    expect(occurrenceOn(series, '2026-02-21')).toBeNull()
    expect(toIcs(series, 'https://example.com', new Date())).toContain(
      'RRULE:FREQ=WEEKLY;UNTIL=20260214T235959Z',
    )
  })

  it('keeps fortnightly UTC instants across DST and exports the interval', () => {
    const series = {
      ...event,
      startsAt: new Date('2026-03-22T19:00:00Z'),
      repeat: 'fortnightly' as const,
      endsAt: null,
    }
    expect(
      occurrences(series, new Date('2026-04-01'), new Date('2026-05-01')).map((item) =>
        item.startsAt.toISOString(),
      ),
    ).toEqual(['2026-04-05T19:00:00.000Z', '2026-04-19T19:00:00.000Z'])
    expect(toIcs(series, '', new Date())).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2')
    expect(toIcs(event, '', new Date())).toContain('RRULE:FREQ=MONTHLY')
  })

  it('validates repeat fields and interprets datetime-local input as UTC', () => {
    const form = { title: 'Training', starts_at: '2026-01-31T19:00' }
    expect(readDraft(form).draft?.startsAt.toISOString()).toBe('2026-01-31T19:00:00.000Z')
    for (const extra of [
      { repeat: 'daily' },
      { repeat: 'monthly', repeat_until: '2026-02-30' },
      { repeat: 'weekly', repeat_until: '2026-01-01' },
      { repeat: 'none', repeat_until: '2026-02-01' },
    ])
      expect(readDraft({ ...form, ...extra }).draft).toBeNull()
  })
})

it('migrates forward and sets, changes and clears only the viewer’s occurrence RSVP', async () => {
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
    await db.exec(
      "insert into plugin_calendar_event (title, starts_at, repeat) values ('Training', '2026-01-31T19:00:00Z', 'weekly')",
    )
    const context = { ...unavailablePluginRuntime('test'), data }
    const send = (status: string, occurrence = '2026-02-07', userId: number | null = 7) => {
      const request: PluginRequest = {
        viewer: { userId, isGuest: userId === null },
        method: 'POST',
        path: 'events/rsvp',
        query: {},
        headers: {},
        rawBody: null,
        json: null,
        boardUrl: '',
        form: { id: '1', status, occurrence, user_id: '999' },
      }
      return handleRsvp(request, context)
    }
    expect(await send('yes')).toMatchObject({ kind: 'redirect' })
    expect(await send('maybe')).toMatchObject({ kind: 'redirect' })
    await send('no', '2026-02-14')
    await send('yes', '2026-02-07', 8)
    const selected = occurrenceOn({ ...event, repeat: 'weekly' }, '2026-02-07')
    expect(selected).not.toBeNull()
    if (selected === null) throw new Error('missing occurrence')
    expect(await rsvpSummary(data, selected, 7)).toEqual({
      counts: { maybe: 1, yes: 1 },
      own: 'maybe',
    })
    await send('clear')
    expect(await rsvpSummary(data, selected, 7)).toEqual({ counts: { yes: 1 }, own: null })
    expect(await send('yes', '2026-02-08')).toMatchObject({ status: 400 })
    expect(await send('invalid')).toMatchObject({ status: 400 })
    expect(await send('yes', '2026-02-07', null)).toMatchObject({ status: 403 })
    expect(await db.query('select * from plugin_calendar_rsvps')).toMatchObject({
      rows: expect.any(Array),
    })
    const dates = await windowEvents(data, new Date('2026-02-01'), new Date('2026-03-01'))
    expect(dates).toHaveLength(4)
    await db.exec('delete from plugin_calendar_event where id = 1')
    expect((await db.query('select * from plugin_calendar_rsvps')).rows).toEqual([])
  } finally {
    await db.close()
  }
})
