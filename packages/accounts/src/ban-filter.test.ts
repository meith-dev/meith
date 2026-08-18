import { describe, expect, it } from 'vitest'

import { ValidationError } from '@meith/core'

import {
  assertUsableFilter,
  BAN_FILTER_PATTERN_MAX,
  BAN_FILTER_WILDCARD_MAX,
  type BanFilter,
  matchBanFilter,
} from './ban-filter'

function filter(type: BanFilter['type'], pattern: string, id = 1): BanFilter {
  return { id, type, pattern }
}

describe('matchBanFilter', () => {
  it('matches a plain value exactly', () => {
    expect(matchBanFilter([filter('username', 'spammer')], { username: 'spammer' })).not.toBeNull()
    expect(matchBanFilter([filter('username', 'spammer')], { username: 'other' })).toBeNull()
  })

  it('matches case-insensitively', () => {
    expect(matchBanFilter([filter('username', 'SpAmMeR')], { username: 'spammer' })).not.toBeNull()
    expect(
      matchBanFilter([filter('email', '*@Spam.Example')], { email: 'a@SPAM.example' }),
    ).not.toBeNull()
  })

  it('expands * to any run and ? to one character', () => {
    expect(
      matchBanFilter([filter('email', '*@spam.example')], { email: 'a@spam.example' }),
    ).not.toBeNull()
    expect(matchBanFilter([filter('username', 'bot?')], { username: 'bot7' })).not.toBeNull()
    expect(matchBanFilter([filter('username', 'bot?')], { username: 'bot42' })).toBeNull()
  })

  it('anchors at both ends', () => {
    expect(matchBanFilter([filter('username', 'spam')], { username: 'notspammer' })).toBeNull()
    expect(matchBanFilter([filter('email', 'a@b.example')], { email: 'xa@b.example' })).toBeNull()
  })

  it('treats regex metacharacters literally', () => {
    expect(
      matchBanFilter([filter('email', '*@spam.example')], { email: 'a@spamXexample' }),
    ).toBeNull()
    expect(matchBanFilter([filter('username', 'a+b')], { username: 'a+b' })).not.toBeNull()
    expect(matchBanFilter([filter('username', 'a+b')], { username: 'aab' })).toBeNull()
    expect(matchBanFilter([filter('username', 'x(y)')], { username: 'x(y)' })).not.toBeNull()
  })

  it('does not let a pattern escape into a real regex', () => {
    expect(matchBanFilter([filter('username', '.*')], { username: 'anything' })).toBeNull()
    expect(matchBanFilter([filter('username', '.*')], { username: '.*' })).not.toBeNull()
  })

  it('matches IP prefixes', () => {
    expect(matchBanFilter([filter('ip', '192.0.2.*')], { ip: '192.0.2.44' })).not.toBeNull()
    expect(matchBanFilter([filter('ip', '192.0.2.*')], { ip: '192.0.3.44' })).toBeNull()
  })

  it('only tests a filter against its own field', () => {
    expect(
      matchBanFilter([filter('username', '*@spam.example')], { email: 'a@spam.example' }),
    ).toBeNull()
  })

  it('skips fields the caller did not supply', () => {
    expect(matchBanFilter([filter('ip', '192.0.2.*')], { username: 'someone' })).toBeNull()
  })

  it('returns the filter that fired, so a block is auditable', () => {
    const filters = [filter('username', 'nope', 1), filter('email', '*@spam.example', 2)]
    expect(matchBanFilter(filters, { email: 'a@spam.example' })?.id).toBe(2)
  })

  it('returns the first match when several apply', () => {
    const filters = [filter('email', '*@spam.example', 7), filter('email', 'a@*', 8)]
    expect(matchBanFilter(filters, { email: 'a@spam.example' })?.id).toBe(7)
  })

  it('matches nothing when there are no filters', () => {
    expect(matchBanFilter([], { username: 'anyone', email: 'a@b.example' })).toBeNull()
  })
})

describe('assertUsableFilter', () => {
  it('accepts a normal pattern', () => {
    expect(() => assertUsableFilter('email', '*@spam.example')).not.toThrow()
  })

  it('rejects an empty pattern', () => {
    expect(() => assertUsableFilter('username', '   ')).toThrow(ValidationError)
  })

  it('rejects a pattern that would match everyone', () => {
    expect(() => assertUsableFilter('username', '*')).toThrow(/lock everyone out/)
    expect(() => assertUsableFilter('email', '***')).toThrow(/lock everyone out/)
  })

  it('rejects an unknown type', () => {
    expect(() => assertUsableFilter('nickname' as 'username', 'x')).toThrow(ValidationError)
  })

  it('rejects a pattern longer than the cap', () => {
    expect(() => assertUsableFilter('username', 'a'.repeat(BAN_FILTER_PATTERN_MAX))).not.toThrow()
    expect(() => assertUsableFilter('username', 'a'.repeat(BAN_FILTER_PATTERN_MAX + 1))).toThrow(
      ValidationError,
    )
  })

  it('rejects a pattern carrying more wildcards than the cap', () => {
    const allowed = `${'a*'.repeat(BAN_FILTER_WILDCARD_MAX)}b`
    expect(() => assertUsableFilter('username', allowed)).not.toThrow()
    expect(() =>
      assertUsableFilter('username', `${'a*'.repeat(BAN_FILTER_WILDCARD_MAX + 1)}b`),
    ).toThrow(ValidationError)
  })

  it('counts ? against the wildcard cap too', () => {
    expect(() => assertUsableFilter('username', '?'.repeat(BAN_FILTER_WILDCARD_MAX + 1))).toThrow(
      ValidationError,
    )
  })

  it('measures the pattern the matcher will see, not the one that was typed', () => {
    expect(() => assertUsableFilter('username', 'İ'.repeat(BAN_FILTER_PATTERN_MAX))).toThrow(
      ValidationError,
    )
  })

  it('counts characters rather than code units, so an emoji is one', () => {
    expect(() => assertUsableFilter('username', '🙂'.repeat(BAN_FILTER_PATTERN_MAX))).not.toThrow()
  })
})

describe('matching stays linear', () => {
  it('answers a classic catastrophic-backtracking pattern promptly', () => {
    const pattern = `${'a*'.repeat(BAN_FILTER_WILDCARD_MAX)}b`
    const value = 'a'.repeat(5_000)

    const started = process.hrtime.bigint()
    expect(matchBanFilter([filter('username', pattern)], { username: value })).toBeNull()
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000

    expect(elapsedMs).toBeLessThan(1_000)
  })

  it('ignores a stored pattern that outgrew the caps', () => {
    const overlong = `${'a'.repeat(BAN_FILTER_PATTERN_MAX + 1)}*`
    expect(
      matchBanFilter([filter('username', overlong)], { username: `${'a'.repeat(300)}x` }),
    ).toBeNull()

    const wild = '*'.repeat(BAN_FILTER_WILDCARD_MAX + 1) + 'x'
    expect(matchBanFilter([filter('username', wild)], { username: 'ax' })).toBeNull()
  })
})
