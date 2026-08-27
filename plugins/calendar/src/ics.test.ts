import { describe, expect, it } from 'vitest'

import type { CalendarEvent } from './events'
import { DEFAULT_DURATION_MINUTES, fold, icsFileName, toIcs } from './ics'

const NOW = new Date('2026-08-01T09:00:00Z')

const EVENT: CalendarEvent = {
  id: '7',
  title: 'Monthly meetup',
  startsAt: new Date('2026-09-05T16:00:00Z'),
  endsAt: new Date('2026-09-05T19:00:00Z'),
  location: 'The Rose & Crown, back room',
  threadId: 12,
  createdByUserId: 1,
  linkUrl: '',
  linkLabel: '',
}

function lines(event: CalendarEvent, boardUrl = 'https://board.example'): string[] {
  return toIcs(event, boardUrl, NOW).split('\r\n')
}

describe('the .ics an event downloads as', () => {
  it('is a single well-formed VEVENT', () => {
    const out = lines(EVENT)

    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out).toContain('BEGIN:VEVENT')
    expect(out).toContain('END:VEVENT')
    expect(out.at(-2)).toBe('END:VCALENDAR')
  })

  it('ends every line with CRLF, as the format requires', () => {
    const raw = toIcs(EVENT, 'https://board.example', NOW)
    expect(raw.endsWith('\r\n')).toBe(true)
    expect(raw.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true)
  })

  it('writes the times as UTC stamps without punctuation', () => {
    const out = lines(EVENT)
    expect(out).toContain('DTSTART:20260905T160000Z')
    expect(out).toContain('DTEND:20260905T190000Z')
    expect(out).toContain('DTSTAMP:20260801T090000Z')
  })

  it('gives an open-ended event a default duration rather than no end', () => {
    const out = lines({ ...EVENT, endsAt: null })
    const expected = new Date(EVENT.startsAt.getTime() + DEFAULT_DURATION_MINUTES * 60_000)
    expect(out).toContain(`DTEND:${expected.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`)
  })

  it('escapes the characters the format reserves', () => {
    const out = lines({ ...EVENT, title: 'Drinks; darts, and a quiz\nupstairs' })
    const summary = out.find((line) => line.startsWith('SUMMARY:'))

    expect(summary).toContain('\\;')
    expect(summary).toContain('\\,')
    expect(summary).toContain('\\n')
    expect(summary).not.toMatch(/[^\\];/)
  })

  it('carries the thread as the event URL, and omits it when there is none', () => {
    expect(lines(EVENT)).toContain('URL:https://board.example/threads/12')
    expect(lines({ ...EVENT, threadId: null }).some((line) => line.startsWith('URL:'))).toBe(false)
  })

  it('omits the location rather than writing an empty one', () => {
    expect(lines({ ...EVENT, location: '' }).some((line) => line.startsWith('LOCATION:'))).toBe(
      false,
    )
  })

  it('builds a UID that is stable for the event and scoped to the board', () => {
    expect(lines(EVENT)).toContain('UID:calendar-7@board.example')
    expect(lines(EVENT)).toEqual(lines(EVENT))
  })
})

describe('folding a long line', () => {
  it('leaves a short line alone', () => {
    expect(fold('SUMMARY:short')).toBe('SUMMARY:short')
  })

  it('wraps a long line with a leading space on each continuation', () => {
    const folded = fold(`SUMMARY:${'x'.repeat(200)}`).split('\r\n')

    expect(folded.length).toBeGreaterThan(1)
    expect(folded[0]?.length).toBe(75)
    expect(folded.slice(1).every((line) => line.startsWith(' '))).toBe(true)
  })

  it('loses nothing it wrapped', () => {
    const original = `SUMMARY:${'abcde'.repeat(40)}`
    expect(fold(original).split('\r\n').join('').replace(/ /g, '')).toBe(original)
  })
})

describe('the file it downloads as', () => {
  it('slugs the title', () => {
    expect(icsFileName(EVENT)).toBe('monthly-meetup.ics')
  })

  it('falls back rather than producing a nameless file', () => {
    expect(icsFileName({ ...EVENT, title: '???' })).toBe('event.ics')
  })
})

describe('when the board does not know its own address', () => {
  it('omits the URL rather than writing a relative one no calendar app can follow', () => {
    for (const boardUrl of ['', '   ', '/', 'localhost:3000']) {
      const out = lines(EVENT, boardUrl)
      expect(
        out.some((line) => line.startsWith('URL:')),
        boardUrl,
      ).toBe(false)
    }
  })

  it('still produces a usable file, with a UID that parses', () => {
    const out = lines(EVENT, '')
    expect(out).toContain('BEGIN:VEVENT')
    expect(out.find((line) => line.startsWith('UID:'))).toMatch(/^UID:calendar-7@\S+$/)
  })

  it('keeps the URL when the address is absolute, with or without a trailing slash', () => {
    expect(lines(EVENT, 'https://board.example/')).toContain('URL:https://board.example/threads/12')
    expect(lines(EVENT, 'http://board.example')).toContain('URL:http://board.example/threads/12')
  })
})

describe('an event that carries a link of its own', () => {
  const WITH_LINK: CalendarEvent = {
    ...EVENT,
    linkUrl: 'https://zoom.example/j/123',
    linkLabel: 'Join online',
  }

  it('makes that link the event URL, since it is the one to act on', () => {
    expect(lines(WITH_LINK)).toContain('URL:https://zoom.example/j/123')
  })

  it('keeps the thread reachable in the description rather than dropping it', () => {
    const description = lines(WITH_LINK).find((line) => line.startsWith('DESCRIPTION:'))
    expect(description).toContain('https://board.example/threads/12')
  })

  it('writes no description when the thread is the only link there is', () => {
    expect(lines(EVENT).some((line) => line.startsWith('DESCRIPTION:'))).toBe(false)
  })

  it('still offers the link when the board does not know its own address', () => {
    const out = lines(WITH_LINK, '')
    expect(out).toContain('URL:https://zoom.example/j/123')
    expect(out.some((line) => line.startsWith('DESCRIPTION:'))).toBe(false)
  })

  it('has a URL even for an event with no thread at all', () => {
    expect(lines({ ...WITH_LINK, threadId: null })).toContain('URL:https://zoom.example/j/123')
  })
})
