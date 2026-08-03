import { describe, expect, it } from 'vitest'

import { defineForumConfig, type InstalledTheme } from './config'

function theme(key: string): InstalledTheme {
  return {
    key,
    title: key,
    tokens: { light: { '--background': '0 0% 100%' }, dark: { '--background': '0 0% 4%' } },
  }
}

describe('defineForumConfig', () => {
  it('returns the config it was given', () => {
    const config = defineForumConfig({
      themes: { default: theme('default') },
      defaultTheme: 'default',
    })
    expect(config.defaultTheme).toBe('default')
  })

  it('accepts several themes', () => {
    const config = defineForumConfig({
      themes: { default: theme('default'), midnight: theme('midnight') },
      defaultTheme: 'midnight',
    })
    expect(Object.keys(config.themes)).toHaveLength(2)
  })

  /*
   * A defaultTheme naming a theme that is not installed would render a board
   * with no tokens at all — a blank page and no error pointing at the cause.
   * Failing at module load names the problem instead.
   */
  it('refuses a defaultTheme that is not registered', () => {
    expect(() =>
      defineForumConfig({ themes: { default: theme('default') }, defaultTheme: 'midnight' }),
    ).toThrow(/defaultTheme "midnight" is not registered/)
  })

  it('lists what is available when the default is wrong', () => {
    expect(() =>
      defineForumConfig({
        themes: { a: theme('a'), b: theme('b') },
        defaultTheme: 'c',
      }),
    ).toThrow(/Available: a, b/)
  })

  /*
   * `themes[key].key !== key` breaks every lookup that round-trips through one
   * or the other — a setting stores the registry key, the theme reports its
   * own, and they stop agreeing.
   */
  it('refuses a theme whose key disagrees with its registration', () => {
    expect(() =>
      defineForumConfig({ themes: { light: theme('default') }, defaultTheme: 'light' }),
    ).toThrow(/declares key "default"/)
  })

  it('refuses an empty registry', () => {
    expect(() => defineForumConfig({ themes: {}, defaultTheme: 'default' })).toThrow(
      /at least one theme/,
    )
  })

  it('refuses a plugin registered twice', () => {
    expect(() =>
      defineForumConfig({
        themes: { default: theme('default') },
        defaultTheme: 'default',
        plugins: [{ key: 'hello' }, { key: 'hello' }],
      }),
    ).toThrow(/registered twice/)
  })

  it('allows no plugins at all', () => {
    expect(() =>
      defineForumConfig({ themes: { default: theme('default') }, defaultTheme: 'default' }),
    ).not.toThrow()
  })

  /*
   * F79. The same check the themes get, and for the same reason: every lookup
   * round-trips through one key or the other. A plugin's settings are stored
   * under `plugin.<key>.…` and its admin routes are namespaced by it, so a
   * mismatch makes it configurable under one name and running under another —
   * with nothing failing, because both names are valid.
   */
  it('refuses a plugin whose declared key disagrees with its registration', () => {
    expect(() =>
      defineForumConfig({
        themes: { default: theme('default') },
        defaultTheme: 'default',
        plugins: [{ key: 'hello', plugin: { key: 'goodbye' } }],
      }),
    ).toThrow(/declares key "goodbye"/)
  })

  it('accepts a plugin entry that carries no definition', () => {
    /*
     * A board may list a plugin it has switched off without the bundler pulling
     * in its code. The key check must not fire on the absence.
     */
    expect(() =>
      defineForumConfig({
        themes: { default: theme('default') },
        defaultTheme: 'default',
        plugins: [{ key: 'hello', enabled: false }],
      }),
    ).not.toThrow()
  })
})
