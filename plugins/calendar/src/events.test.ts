import { describe, expect, it } from 'vitest'

import {
  byStart,
  type CalendarEvent,
  dayParts,
  eventHref,
  formatRange,
  groupByMonth,
  isUpcoming,
  MAX_LINK_LABEL,
  MAX_LINK_URL,
  MAX_TITLE,
  parseThreadRef,
  pickThreadEvent,
  readDraft,
  relativeHint,
  safeLinkUrl,
} from './events'

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    title: 'Raid night',
    starts_at: '2026-09-01T19:00:00Z',
    ends_at: '2026-09-01T22:00:00Z',
    location: 'Discord',
    thread: '',
    ...overrides,
  }
}

describe('reading a submitted event', () => {
  it('accepts a complete draft', () => {
    const { draft, problems } = readDraft(form())

    expect(problems).toEqual([])
    expect(draft).toMatchObject({ title: 'Raid night', location: 'Discord', threadId: null })
    expect(draft?.startsAt.toISOString()).toBe('2026-09-01T19:00:00.000Z')
    expect(draft?.endsAt?.toISOString()).toBe('2026-09-01T22:00:00.000Z')
  })

  it('accepts an open-ended event', () => {
    const { draft, problems } = readDraft(form({ ends_at: '' }))
    expect(problems).toEqual([])
    expect(draft?.endsAt).toBeNull()
  })

  it.each([
    ['title-missing', form({ title: '   ' })],
    ['title-too-long', form({ title: 'x'.repeat(MAX_TITLE + 1) })],
    ['starts-missing', form({ starts_at: 'not a date' })],
    ['ends-before-starts', form({ ends_at: '2026-08-01T00:00:00Z' })],
    ['too-long', form({ ends_at: '2027-09-01T19:00:00Z' })],
  ])('refuses a draft with %s', (problem, submitted) => {
    const { draft, problems } = readDraft(submitted)

    expect(problems).toContain(problem)
    expect(draft).toBeNull()
  })

  it('refuses an end equal to the start, which is not a duration', () => {
    expect(readDraft(form({ ends_at: '2026-09-01T19:00:00Z' })).problems).toContain(
      'ends-before-starts',
    )
  })
})

describe('linking an event to a thread', () => {
  it.each([
    ['https://board.example/threads/42', 42],
    ['/threads/42', 42],
    ['/thread/42', 42],
    ['42', 42],
    ['  42  ', 42],
  ])('reads %o as thread %i', (raw, expected) => {
    expect(parseThreadRef(raw)).toBe(expected)
  })

  it.each(['', '   ', 'https://board.example/members/42', 'abc', '0', '-1'])(
    'refuses %o rather than guessing',
    (raw) => {
      expect(parseThreadRef(raw)).toBeNull()
    },
  )

  it('carries the parsed id onto the draft', () => {
    expect(readDraft(form({ thread: '/threads/7' })).draft?.threadId).toBe(7)
  })
})

describe('ordering and filtering', () => {
  const at = (iso: string, endsAt: string | null = null): CalendarEvent => ({
    id: iso,
    title: 'x',
    startsAt: new Date(iso),
    endsAt: endsAt === null ? null : new Date(endsAt),
    location: '',
    threadId: null,
    createdByUserId: null,
    linkUrl: '',
    linkLabel: '',
  })

  const now = new Date('2026-09-01T20:00:00Z')

  it('counts an event still running as upcoming', () => {
    expect(isUpcoming(at('2026-09-01T19:00:00Z', '2026-09-01T22:00:00Z'), now)).toBe(true)
  })

  it('counts an event that has finished as past', () => {
    expect(isUpcoming(at('2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z'), now)).toBe(false)
  })

  it('falls back to the start when there is no end', () => {
    expect(isUpcoming(at('2026-09-01T21:00:00Z'), now)).toBe(true)
    expect(isUpcoming(at('2026-09-01T19:00:00Z'), now)).toBe(false)
  })

  it('sorts by start', () => {
    const sorted = [at('2026-09-03T00:00:00Z'), at('2026-09-01T00:00:00Z')].sort(byStart)
    expect(sorted.map((event) => event.id)).toEqual([
      '2026-09-01T00:00:00Z',
      '2026-09-03T00:00:00Z',
    ])
  })

  it('links to the thread only when there is one', () => {
    expect(eventHref({ ...at('2026-09-01T00:00:00Z'), threadId: 9 })).toBe('/threads/9')
    expect(eventHref(at('2026-09-01T00:00:00Z'))).toBeNull()
  })
})

describe('how a time is shown', () => {
  it('reads as a date and a time, not an ISO string', () => {
    const shown = formatRange(new Date('2026-08-30T17:00:00Z'), null)

    expect(shown).not.toContain('T')
    expect(shown).not.toContain('Z')
    expect(shown).toMatch(/2026/)
    expect(shown).toMatch(/17:00/)
  })

  it('drops the repeated date when an event starts and ends the same day', () => {
    const shown = formatRange(new Date('2026-08-30T17:00:00Z'), new Date('2026-08-30T20:00:00Z'))

    expect(shown).toMatch(/17:00 — 20:00$/)
    expect(shown.match(/2026/g)).toHaveLength(1)
  })

  it('keeps both dates when an event runs across days', () => {
    const shown = formatRange(new Date('2026-08-30T17:00:00Z'), new Date('2026-08-31T02:00:00Z'))

    expect(shown.match(/2026/g)).toHaveLength(2)
  })

  it('never shows seconds, which no event needs', () => {
    expect(formatRange(new Date('2026-08-30T17:04:18.891Z'), null)).not.toContain('18')
  })

  it('follows the reader’s locale', () => {
    const iso = new Date('2026-08-30T17:00:00Z')
    expect(formatRange(iso, null, 'en-US')).not.toBe(formatRange(iso, null, 'de-DE'))
  })
})

describe('the agenda’s date block', () => {
  it('gives a padded day and a short weekday', () => {
    expect(dayParts(new Date('2026-09-05T16:00:00Z'), 'en-GB')).toEqual({
      day: '05',
      weekday: 'SAT',
    })
  })

  it('reads the day in UTC, so a late event is not shown on the wrong date', () => {
    expect(dayParts(new Date('2026-09-05T23:30:00Z')).day).toBe('05')
  })
})

describe('grouping into months', () => {
  const at = (iso: string): CalendarEvent => ({
    id: iso,
    title: iso,
    startsAt: new Date(iso),
    endsAt: null,
    location: '',
    threadId: null,
    createdByUserId: null,
    linkUrl: '',
    linkLabel: '',
  })

  it('runs consecutive events of one month under a single heading', () => {
    const months = groupByMonth(
      [at('2026-09-01T10:00:00Z'), at('2026-09-20T10:00:00Z'), at('2026-10-02T10:00:00Z')],
      'en-GB',
    )

    expect(months.map((month) => month.key)).toEqual(['2026-09', '2026-10'])
    expect(months[0]?.events).toHaveLength(2)
    expect(months[0]?.label).toContain('SEPTEMBER')
  })

  it('keeps the order it was given rather than re-sorting', () => {
    const months = groupByMonth([at('2026-10-02T10:00:00Z'), at('2026-09-01T10:00:00Z')])
    expect(months.map((month) => month.key)).toEqual(['2026-10', '2026-09'])
  })

  it('has nothing to group when there are no events', () => {
    expect(groupByMonth([])).toEqual([])
  })
})

describe('the relative hint', () => {
  const now = new Date('2026-09-01T12:00:00Z')

  it.each([
    ['2026-09-01T20:00:00Z', 'today'],
    ['2026-09-02T09:00:00Z', 'tomorrow'],
    ['2026-08-31T09:00:00Z', 'yesterday'],
  ])('calls %s %s', (iso, expected) => {
    expect(relativeHint(new Date(iso), now, 'en-GB')).toBe(expected)
  })

  it('counts in days within the week, whatever the clock time', () => {
    expect(relativeHint(new Date('2026-09-04T01:00:00Z'), now, 'en-GB')).toBe('in 3 days')
  })

  it('switches to weeks, then months, as it gets further away', () => {
    expect(relativeHint(new Date('2026-09-20T12:00:00Z'), now, 'en-GB')).toContain('week')
    expect(relativeHint(new Date('2026-12-01T12:00:00Z'), now, 'en-GB')).toContain('month')
  })

  it('looks backwards for something that has already happened', () => {
    expect(relativeHint(new Date('2026-08-29T12:00:00Z'), now, 'en-GB')).toBe('3 days ago')
    expect(relativeHint(new Date('2026-08-12T12:00:00Z'), now, 'en-GB')).toBe('2 weeks ago')
  })
})

describe('the link an event can carry', () => {
  it('keeps an https link and the words the organiser chose for it', () => {
    const { draft, problems } = readDraft(
      form({ link: 'https://zoom.example/j/123', link_text: 'Join online' }),
    )

    expect(problems).toEqual([])
    expect(draft?.linkUrl).toBe('https://zoom.example/j/123')
    expect(draft?.linkLabel).toBe('Join online')
  })

  it('keeps the query string a ticket link needs', () => {
    expect(
      readDraft(
        form({ link: 'https://meetup.example/e/42?utm=board#tickets', link_text: 'Get tickets' }),
      ).draft?.linkUrl,
    ).toBe('https://meetup.example/e/42?utm=board#tickets')
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox',
    'file:///etc/passwd',
    'not a url at all',
    '//evil.example/path',
  ])('refuses %o rather than rendering it as a link', (link) => {
    const { draft, problems } = readDraft(form({ link, link_text: 'Join online' }))

    expect(draft).toBeNull()
    expect(problems).toContain('link-not-a-url')
  })

  it('allows plain http, since not every community runs TLS on its own tooling', () => {
    expect(readDraft(form({ link: 'http://intranet.example/meet' })).problems).toEqual([])
  })

  it('refuses a link longer than the column holds', () => {
    expect(
      readDraft(form({ link: `https://example.com/${'x'.repeat(MAX_LINK_URL)}` })).problems,
    ).toContain('link-too-long')
  })

  it('refuses link text longer than a button can show', () => {
    expect(
      readDraft(form({ link: 'https://zoom.example', link_text: 'x'.repeat(MAX_LINK_LABEL + 1) }))
        .problems,
    ).toContain('link-label-too-long')
  })

  it('refuses words with no link behind them, rather than storing a dead label', () => {
    expect(readDraft(form({ link_text: 'Join online' })).problems).toContain(
      'link-label-without-link',
    )
  })

  it('leaves both empty when no link is offered', () => {
    const { draft } = readDraft(form())
    expect(draft?.linkUrl).toBe('')
    expect(draft?.linkLabel).toBe('')
  })

  it('accepts a link with no words, so the page can fall back to its own', () => {
    const { draft, problems } = readDraft(form({ link: 'https://zoom.example/j/1' }))
    expect(problems).toEqual([])
    expect(draft?.linkLabel).toBe('')
  })
})

describe('safeLinkUrl on its own', () => {
  it('normalises what it accepts', () => {
    expect(safeLinkUrl('  https://Example.com  ')).toBe('https://example.com/')
  })

  it('refuses a URL with no host', () => {
    expect(safeLinkUrl('https://')).toBeNull()
    expect(safeLinkUrl('')).toBeNull()
  })
})

describe('which event a thread shows', () => {
  const now = new Date('2026-09-01T12:00:00Z')
  const at = (id: string, iso: string, endsAt: string | null = null): CalendarEvent => ({
    id,
    title: id,
    startsAt: new Date(iso),
    endsAt: endsAt === null ? null : new Date(endsAt),
    location: '',
    threadId: 2,
    createdByUserId: null,
    linkUrl: '',
    linkLabel: '',
  })

  it('shows nothing when the thread has no event', () => {
    expect(pickThreadEvent([], now)).toBeNull()
  })

  it('prefers the soonest upcoming one over an earlier one that has passed', () => {
    const chosen = pickThreadEvent(
      [at('old-agm', '2026-08-14T20:00:00Z'), at('devfest', '2026-09-26T09:00:00Z')],
      now,
    )
    expect(chosen?.id).toBe('devfest')
  })

  it('picks the soonest of several upcoming, not the furthest away', () => {
    const chosen = pickThreadEvent(
      [at('later', '2026-10-01T09:00:00Z'), at('sooner', '2026-09-05T09:00:00Z')],
      now,
    )
    expect(chosen?.id).toBe('sooner')
  })

  it('falls back to the most recent past one when nothing is upcoming', () => {
    const chosen = pickThreadEvent(
      [at('ancient', '2026-01-01T09:00:00Z'), at('recent', '2026-08-20T09:00:00Z')],
      now,
    )
    expect(chosen?.id).toBe('recent')
  })

  it('counts an event still running as the one to show', () => {
    const chosen = pickThreadEvent(
      [
        at('running', '2026-09-01T09:00:00Z', '2026-09-01T18:00:00Z'),
        at('next', '2026-09-20T09:00:00Z'),
      ],
      now,
    )
    expect(chosen?.id).toBe('running')
  })

  it('does not depend on the order it was given', () => {
    const events = [at('devfest', '2026-09-26T09:00:00Z'), at('old-agm', '2026-08-14T20:00:00Z')]
    expect(pickThreadEvent(events, now)?.id).toBe(pickThreadEvent([...events].reverse(), now)?.id)
  })
})
