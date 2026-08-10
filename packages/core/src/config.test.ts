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
    expect(() =>
      defineForumConfig({
        themes: { default: theme('default') },
        defaultTheme: 'default',
        plugins: [{ key: 'hello', enabled: false }],
      }),
    ).not.toThrow()
  })
})
