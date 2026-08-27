import { describe, expect, it } from 'vitest'

import { DEMO_ACCOUNTS } from './accounts'
import { CALENDAR_DEMO_EVENTS, CALENDAR_ORGANISERS, eventEndsAt, eventStartsAt } from './calendar'
import { DEMO_THREADS } from './content'

const NOW = new Date('2026-09-01T12:00:00Z')

describe('the calendar the demo board is furnished with', () => {
  it('links only to threads the demo board actually seeds', () => {
    const titles = new Set(DEMO_THREADS.map((thread) => thread.title))

    for (const event of CALENDAR_DEMO_EVENTS) {
      if (event.threadTitle === null) continue
      expect(titles, event.title).toContain(event.threadTitle)
    }
  })

  it('is organised by members the demo board actually creates', () => {
    const keys = new Set(DEMO_ACCOUNTS.map((account) => account.key))

    for (const key of CALENDAR_ORGANISERS) expect(keys).toContain(key)
    for (const event of CALENDAR_DEMO_EVENTS) expect(keys, event.title).toContain(event.organiser)
  })

  it('shows a board that is neither empty nor only in the past', () => {
    const upcoming = CALENDAR_DEMO_EVENTS.filter((event) => event.daysFromNow > 0)
    const past = CALENDAR_DEMO_EVENTS.filter((event) => event.daysFromNow < 0)

    expect(upcoming.length).toBeGreaterThanOrEqual(4)
    expect(past.length).toBeGreaterThanOrEqual(1)
  })

  it('spans more than one month, so the agenda shows its month headings', () => {
    const months = new Set(
      CALENDAR_DEMO_EVENTS.filter((event) => event.daysFromNow > 0).map((event) =>
        eventStartsAt(event, NOW).toISOString().slice(0, 7),
      ),
    )

    expect(months.size).toBeGreaterThan(1)
  })

  it('shows both a link with words and an event with none', () => {
    expect(CALENDAR_DEMO_EVENTS.some((event) => event.linkLabel !== '')).toBe(true)
    expect(CALENDAR_DEMO_EVENTS.some((event) => event.linkUrl === '')).toBe(true)
  })

  it('offers only https links, the way the plugin accepts them', () => {
    for (const event of CALENDAR_DEMO_EVENTS) {
      if (event.linkUrl === '') continue
      expect(event.linkUrl, event.title).toMatch(/^https:\/\//)
      expect(event.linkLabel, event.title).not.toBe('')
    }
  })

  it('shows an open-ended event as well as ones that finish', () => {
    expect(CALENDAR_DEMO_EVENTS.some((event) => event.durationHours === null)).toBe(true)
    expect(CALENDAR_DEMO_EVENTS.some((event) => event.durationHours !== null)).toBe(true)
  })
})

describe('placing a demo event in time', () => {
  it('puts it the stated number of days out, at the stated hour, in UTC', () => {
    const event = CALENDAR_DEMO_EVENTS[0] as (typeof CALENDAR_DEMO_EVENTS)[number]
    const startsAt = eventStartsAt(
      { ...event, daysFromNow: 2, startHour: 12, startMinute: 15 },
      NOW,
    )

    expect(startsAt.toISOString()).toBe('2026-09-03T12:15:00.000Z')
  })

  it('ends an event after its duration, and leaves an open-ended one open', () => {
    const event = CALENDAR_DEMO_EVENTS[0] as (typeof CALENDAR_DEMO_EVENTS)[number]
    const startsAt = eventStartsAt(event, NOW)

    expect(eventEndsAt({ ...event, durationHours: 3 }, startsAt)?.toISOString()).toBe(
      new Date(startsAt.getTime() + 3 * 3_600_000).toISOString(),
    )
    expect(eventEndsAt({ ...event, durationHours: null }, startsAt)).toBeNull()
  })

  it('keeps a past event in the past and an upcoming one ahead', () => {
    for (const event of CALENDAR_DEMO_EVENTS) {
      const startsAt = eventStartsAt(event, NOW)
      if (event.daysFromNow > 0)
        expect(startsAt.getTime(), event.title).toBeGreaterThan(NOW.getTime())
      if (event.daysFromNow < -1)
        expect(startsAt.getTime(), event.title).toBeLessThan(NOW.getTime())
    }
  })
})
