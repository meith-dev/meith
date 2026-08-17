import { describe, expect, it } from 'vitest'

import { createCatalogRegistry } from './catalog'

const board = {
  id: 'meith',
  messages: {
    en: { 'nav.home': 'Home', 'nav.search': 'Search' },
    de: { 'nav.home': 'Startseite' },
  },
}

describe('createCatalogRegistry', () => {
  it('falls back to the source locale for a key the translation is missing', () => {
    const registry = createCatalogRegistry([board])

    expect(registry.catalogFor('de')).toEqual({ 'nav.home': 'Startseite', 'nav.search': 'Search' })
  })

  it('prefers the more specific tag over the language it falls back to', () => {
    const registry = createCatalogRegistry([
      { id: 'meith', messages: { en: { greeting: 'Hello' }, 'en-AU': { greeting: 'G’day' } } },
    ])

    expect(registry.catalogFor('en-AU').greeting).toBe('G’day')
    expect(registry.catalogFor('en-NZ').greeting).toBe('Hello')
  })

  it('lets a later source override an earlier one, which is how a theme rewords the board', () => {
    const registry = createCatalogRegistry([board])
    registry.register({ id: 'theme-clubhouse', messages: { en: { 'nav.home': 'Lobby' } } })

    expect(registry.catalogFor('en')['nav.home']).toBe('Lobby')
    expect(registry.catalogFor('en')['nav.search']).toBe('Search')
  })

  it('replaces a source registered twice under the same id instead of stacking it', () => {
    const registry = createCatalogRegistry([board])
    registry.register({ id: 'plugin-dues', messages: { en: { 'dues.due': 'Due' } } })
    registry.register({ id: 'plugin-dues', messages: { en: { 'dues.due': 'Owing' } } })

    expect(registry.sources).toEqual(['meith', 'plugin-dues'])
    expect(registry.catalogFor('en')['dues.due']).toBe('Owing')
  })

  it('reports every locale any source can serve', () => {
    const registry = createCatalogRegistry([board])
    registry.register({ id: 'plugin-dues', messages: { 'pt-BR': { 'dues.due': 'Devido' } } })

    expect(registry.locales).toEqual(['de', 'en', 'pt-BR'])
    expect(registry.supports('PT-br')).toBe(true)
    expect(registry.supports('ja')).toBe(false)
  })

  it('sees a source registered after a lookup, rather than serving the cached answer', () => {
    const registry = createCatalogRegistry([board])
    expect(registry.catalogFor('en')['nav.home']).toBe('Home')

    registry.register({ id: 'theme-midnight', messages: { en: { 'nav.home': 'Base' } } })
    expect(registry.catalogFor('en')['nav.home']).toBe('Base')
  })
})
