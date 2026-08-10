import { describe, expect, it } from 'vitest'

import { resolveBoardUrl } from './board-url'
import { isUsableOrigin, normaliseOrigin } from './origin'
import { SettingsSnapshot } from './store'

function board(overrides: Record<string, string> = {}): SettingsSnapshot {
  return SettingsSnapshot.fromOverrides(new Map(Object.entries(overrides)))
}

describe('resolveBoardUrl', () => {
  it('lets APP_URL win outright, ignoring a configured board', () => {
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
    expect(
      resolveBoardUrl({
        environment: { APP_URL },
        settings: board({ 'board.url': 'https://from-board.example' }),
      }).source,
    ).toBe('board')
  })

  it('reports "none" rather than guessing when neither is set', () => {
    expect(resolveBoardUrl({ environment: {}, settings: board() })).toEqual({
      url: '',
      source: 'none',
    })
  })

  it('normalises a trailing slash from either source', () => {
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
    expect(isUsableOrigin('https://board.example/')).toBe(true)
  })
})
