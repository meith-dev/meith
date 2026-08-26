import { describe, expect, it } from 'vitest'

import {
  byStart,
  type CalendarEvent,
  eventHref,
  isUpcoming,
  MAX_TITLE,
  parseThreadRef,
  readDraft,
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
