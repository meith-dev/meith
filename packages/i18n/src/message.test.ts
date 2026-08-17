import { describe, expect, it } from 'vitest'

import { formatMessage, type MessageArgs, MessageSyntaxError, messagePlaceholders } from './message'

function en(pattern: string, args: MessageArgs = {}): string {
  return formatMessage(pattern, args, { locale: 'en', timeZone: 'UTC' })
}

describe('placeholders', () => {
  it('substitutes a named value', () => {
    expect(en('Welcome back, {name}.', { name: 'Ada' })).toBe('Welcome back, Ada.')
  })

  it('renders a missing value as nothing rather than "undefined"', () => {
    expect(en('Welcome back, {name}.')).toBe('Welcome back, .')
  })

  it('groups numbers by the rules of the locale, not of English', () => {
    const args = { count: 1234567 }

    expect(formatMessage('{count, number}', args, { locale: 'en', timeZone: 'UTC' })).toBe(
      '1,234,567',
    )
    expect(formatMessage('{count, number}', args, { locale: 'de', timeZone: 'UTC' })).toBe(
      '1.234.567',
    )
    expect(formatMessage('{count, number}', args, { locale: 'fr', timeZone: 'UTC' })).toBe(
      '1 234 567',
    )
  })

  it('takes number skeletons for the styles Intl exposes', () => {
    expect(en('{share, number, percent}', { share: 0.42 })).toBe('42%')
    expect(en('{year, number, ::group-off}', { year: 2026 })).toBe('2026')
    expect(en('{size, number, ::.0}', { size: 1.25 })).toBe('1.3')
  })

  it('formats dates in the zone it is given, not the host zone', () => {
    const at = new Date('2026-03-12T23:30:00Z')

    expect(formatMessage('{at, date, short}', { at }, { locale: 'en-GB', timeZone: 'UTC' })).toBe(
      '12/03/2026',
    )
    expect(
      formatMessage('{at, date, short}', { at }, { locale: 'en-GB', timeZone: 'Pacific/Auckland' }),
    ).toBe('13/03/2026')
  })
})

describe('plurals', () => {
  const POSTS = '{count, plural, one {# post} other {# posts}}'

  it('picks the category English has', () => {
    expect(en(POSTS, { count: 1 })).toBe('1 post')
    expect(en(POSTS, { count: 4 })).toBe('4 posts')
    expect(en(POSTS, { count: 0 })).toBe('0 posts')
  })

  it('picks the categories English does not have', () => {
    const russian = '{count, plural, one {# сообщение} few {# сообщения} other {# сообщений}}'
    const format = (count: number) =>
      formatMessage(russian, { count }, { locale: 'ru', timeZone: 'UTC' })

    expect(format(1)).toBe('1 сообщение')
    expect(format(2)).toBe('2 сообщения')
    expect(format(5)).toBe('5 сообщений')
  })

  it('prefers an exact match over a category', () => {
    const pattern = '{count, plural, =0 {no posts} one {# post} other {# posts}}'

    expect(en(pattern, { count: 0 })).toBe('no posts')
    expect(en(pattern, { count: 1 })).toBe('1 post')
  })

  it('subtracts the offset from the hash but not from the category choice', () => {
    const pattern = '{count, plural, offset:1 one {and one other} other {and # others}}'

    expect(en(pattern, { count: 2 })).toBe('and one other')
    expect(en(pattern, { count: 4 })).toBe('and 3 others')
  })

  it('formats the hash by the locale', () => {
    expect(
      formatMessage(
        '{count, plural, other {# Beiträge}}',
        { count: 4000 },
        {
          locale: 'de',
          timeZone: 'UTC',
        },
      ),
    ).toBe('4.000 Beiträge')
  })

  it('handles ordinals', () => {
    const pattern =
      '{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} in the thread'

    expect(en(pattern, { place: 1 })).toBe('1st in the thread')
    expect(en(pattern, { place: 2 })).toBe('2nd in the thread')
    expect(en(pattern, { place: 3 })).toBe('3rd in the thread')
    expect(en(pattern, { place: 11 })).toBe('11th in the thread')
  })

  it('nests inside another placeholder', () => {
    const pattern =
      '{forums, plural, one {one forum} other {# forums}}, {threads, plural, one {one thread} other {# threads}}'

    expect(en(pattern, { forums: 1, threads: 9 })).toBe('one forum, 9 threads')
  })
})

describe('select', () => {
  const pattern = '{gender, select, female {she} male {he} other {they}} replied'

  it('matches the branch by value', () => {
    expect(en(pattern, { gender: 'female' })).toBe('she replied')
    expect(en(pattern, { gender: 'male' })).toBe('he replied')
  })

  it('falls back to other for anything unlisted', () => {
    expect(en(pattern, { gender: 'unstated' })).toBe('they replied')
    expect(en(pattern)).toBe('they replied')
  })
})

describe('quoting', () => {
  it('keeps a brace that was escaped', () => {
    expect(en("A literal '{name}' brace")).toBe('A literal {name} brace')
  })

  it('reads a lone apostrophe as an apostrophe', () => {
    expect(en("Ada's posts")).toBe("Ada's posts")
    expect(en("{name}'s posts", { name: 'Ada' })).toBe("Ada's posts")
  })

  it('reads a doubled apostrophe as one apostrophe', () => {
    expect(en("Ada''s posts")).toBe("Ada's posts")
  })

  it('escapes a hash inside a plural branch', () => {
    expect(en("{count, plural, other {'#' {count}}}", { count: 3 })).toBe('# 3')
  })
})

describe('syntax errors', () => {
  it('rejects a plural with no other branch', () => {
    expect(() => en('{count, plural, one {# post}}')).toThrow(MessageSyntaxError)
  })

  it('rejects an unknown plural category, which would silently never match', () => {
    expect(() => en('{count, plural, many_ish {#} other {#}}')).toThrow(MessageSyntaxError)
  })

  it('rejects an unknown placeholder type', () => {
    expect(() => en('{at, calendar}')).toThrow(MessageSyntaxError)
  })

  it('rejects an unterminated placeholder', () => {
    expect(() => en('Welcome, {name')).toThrow(MessageSyntaxError)
  })

  it('rejects a stray closing brace', () => {
    expect(() => en('Welcome}')).toThrow(MessageSyntaxError)
  })
})

describe('messagePlaceholders', () => {
  it('names every argument a message reads, including nested ones', () => {
    const names = messagePlaceholders(
      '{who} left {count, plural, one {# note} other {# notes}} on {at, date, short}',
    )

    expect([...names].sort()).toEqual(['at', 'count', 'who'])
  })
})
