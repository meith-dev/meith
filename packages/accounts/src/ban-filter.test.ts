import { ValidationError } from '@meith/core'
import { describe, expect, it } from 'vitest'

import { assertUsableFilter, matchBanFilter, type BanFilter } from './ban-filter'

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
    expect(matchBanFilter([filter('email', '*@spam.example')], { email: 'a@spam.example' })).not.toBeNull()
    expect(matchBanFilter([filter('username', 'bot?')], { username: 'bot7' })).not.toBeNull()
    expect(matchBanFilter([filter('username', 'bot?')], { username: 'bot42' })).toBeNull()
  })

  /*
   * Unanchored, `spam` would match `notspam@example.com` and ban people the
   * admin never named. Anchoring is what keeps a filter meaning what it says.
   */
  it('anchors at both ends', () => {
    expect(matchBanFilter([filter('username', 'spam')], { username: 'notspammer' })).toBeNull()
    expect(matchBanFilter([filter('email', 'a@b.example')], { email: 'xa@b.example' })).toBeNull()
  })

  /*
   * An unescaped `.` is a regex wildcard, so `*@spam.example` would also match
   * `*@spamXexample` — a silently wider ban than the admin typed.
   */
  it('treats regex metacharacters literally', () => {
    expect(matchBanFilter([filter('email', '*@spam.example')], { email: 'a@spamXexample' })).toBeNull()
    expect(matchBanFilter([filter('username', 'a+b')], { username: 'a+b' })).not.toBeNull()
    expect(matchBanFilter([filter('username', 'a+b')], { username: 'aab' })).toBeNull()
    expect(matchBanFilter([filter('username', 'x(y)')], { username: 'x(y)' })).not.toBeNull()
  })

  it('does not let a pattern escape into a real regex', () => {
    // `.*` as a literal must match only the literal characters.
    expect(matchBanFilter([filter('username', '.*')], { username: 'anything' })).toBeNull()
    expect(matchBanFilter([filter('username', '.*')], { username: '.*' })).not.toBeNull()
  })

  it('matches IP prefixes', () => {
    expect(matchBanFilter([filter('ip', '192.0.2.*')], { ip: '192.0.2.44' })).not.toBeNull()
    expect(matchBanFilter([filter('ip', '192.0.2.*')], { ip: '192.0.3.44' })).toBeNull()
  })

  it('only tests a filter against its own field', () => {
    // A username filter must not fire because the email happens to match.
    expect(matchBanFilter([filter('username', '*@spam.example')], { email: 'a@spam.example' })).toBeNull()
  })

  it('skips fields the caller did not supply', () => {
    // No IP available (a CLI registration) must not throw or match.
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

  /*
   * `*` matches every value of its type, which locks the whole board out of
   * registration or login — including the administrator who typed it.
   */
  it('rejects a pattern that would match everyone', () => {
    expect(() => assertUsableFilter('username', '*')).toThrow(/lock everyone out/)
    expect(() => assertUsableFilter('email', '***')).toThrow(/lock everyone out/)
  })

  it('rejects an unknown type', () => {
    expect(() => assertUsableFilter('nickname' as 'username', 'x')).toThrow(ValidationError)
  })
})
