/**
 * The board's address, and the validation that is not `z.string().url()`.
 *
 * This value is concatenated with a path and emitted into an `href` in mail
 * clients, feeds and canonical tags. "Parses as a URL" is therefore the wrong
 * question — `mailto:` and `javascript:` both parse — and the tests that matter
 * here are the ones about what gets *rejected*.
 */
import { describe, expect, it } from 'vitest'

import { resolveBoardUrl } from './board-url'
/*
 * From `origin.ts` rather than through `board-url`'s re-export: these two are
 * the leaf module's whole contract, and importing them from where they live is
 * what fails if somebody moves them back and reintroduces the cycle.
 */
import { isUsableOrigin, normaliseOrigin } from './origin'
import { SettingsSnapshot } from './store'

function board(overrides: Record<string, string> = {}): SettingsSnapshot {
  return SettingsSnapshot.fromOverrides(new Map(Object.entries(overrides)))
}

describe('resolveBoardUrl', () => {
  it('lets APP_URL win outright, ignoring a configured board', () => {
    /* Mail's precedence rule, deliberately the same one, so it is one sentence. */
    const resolved = resolveBoardUrl({
      environment: { APP_URL: 'https://from-env.example' },
      settings: board({ 'board.url': 'https://from-board.example' }),
    })

    expect(resolved).toEqual({ url: 'https://from-env.example', source: 'environment' })
  })

  it('uses the board when APP_URL says nothing', () => {
    expect(
      resolveBoardUrl({
        environment: {},
        settings: board({ 'board.url': 'https://from-board.example' }),
      }),
    ).toEqual({ url: 'https://from-board.example', source: 'board' })
  })

  it.each([[''], ['   ']])('treats an APP_URL of %o as unset', (APP_URL) => {
    /*
     * A compose file forwarding `APP_URL=${APP_URL:-}` hands the container an
     * empty string until somebody sets it, and that is the ordinary shape of
     * every deployment this project documents. Reading it as "the environment
     * has decided, and decided on nothing" would make the board's own setting
     * unreachable on exactly those deployments.
     */
    expect(
      resolveBoardUrl({
        environment: { APP_URL },
        settings: board({ 'board.url': 'https://from-board.example' }),
      }).source,
    ).toBe('board')
  })

  it('reports "none" rather than guessing when neither is set', () => {
    /*
     * Distinguished from an empty string so callers can act on it: the mail
     * paths send written instructions instead of a dead link, and the feed
     * builder substitutes a localhost origin. Collapsing the two would force
     * one of those behaviours on both.
     */
    expect(resolveBoardUrl({ environment: {}, settings: board() })).toEqual({
      url: '',
      source: 'none',
    })
  })

  it('normalises a trailing slash from either source', () => {
    /*
     * `https://board.example//thread/1` works everywhere except the canonical
     * tag and the feed id, where it splits one thread into two entries for
     * every subscriber — silently, and only for the people who subscribed.
     */
    expect(
      resolveBoardUrl({ environment: { APP_URL: 'https://board.example/' }, settings: board() })
        .url,
    ).toBe('https://board.example')

    expect(
      resolveBoardUrl({
        environment: {},
        settings: board({ 'board.url': 'https://board.example///' }),
      }).url,
    ).toBe('https://board.example')
  })
})

describe('normaliseOrigin', () => {
  it('strips trailing slashes and surrounding whitespace, and nothing else', () => {
    expect(normaliseOrigin('  https://board.example/  ')).toBe('https://board.example')
    expect(normaliseOrigin('https://board.example:8443')).toBe('https://board.example:8443')
    /* Not a "clean the URL" function — an inner slash is somebody's real path. */
    expect(normaliseOrigin('https://board.example/base/')).toBe('https://board.example/base')
  })
})

describe('isUsableOrigin', () => {
  it.each([
    'https://board.example',
    'http://board.example',
    'http://localhost:3000',
    'https://board.example:8443',
    'https://board.example/',
  ])('accepts %o', (value) => {
    expect(isUsableOrigin(value)).toBe(true)
  })

  it.each([
    ['', 'nothing'],
    ['board.example', 'no scheme — nothing can be built from it'],
    ['//board.example', 'protocol-relative, which a mail client cannot resolve'],
    ['mailto:hi@board.example', 'parses as a URL, and is not one a link can use'],
    ['javascript:alert(1)', 'the entire reason this is not z.string().url()'],
    ['ftp://board.example', 'a scheme no browser will follow from an e-mail'],
    ['https://board.example/forum', 'a page address — every link would carry /forum'],
    ['https://board.example/?ref=x', 'a query that would end up mid-URL'],
    ['https://board.example/#top', 'a fragment, same problem'],
  ])('refuses %o — %s', (value) => {
    expect(isUsableOrigin(value)).toBe(false)
  })

  it('accepts a bare slash as "no path", since that is what an origin looks like', () => {
    /* `new URL('https://x.example').pathname` is `/`, not `''`. */
    expect(isUsableOrigin('https://board.example/')).toBe(true)
  })
})
