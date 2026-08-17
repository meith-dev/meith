import { type Locale, localeChain, normaliseLocale, SOURCE_LOCALE } from './locale'

export interface MessageCatalog {
  readonly [key: string]: string
}

export interface CatalogBundle {
  readonly [locale: string]: MessageCatalog
}

export interface CatalogSource {
  readonly id: string
  readonly messages: CatalogBundle
}

export interface CatalogRegistry {
  readonly sources: readonly string[]
  readonly locales: readonly Locale[]
  register(source: CatalogSource): void
  catalogFor(locale: Locale): MessageCatalog
  supports(locale: Locale): boolean
}

export function createCatalogRegistry(initial: readonly CatalogSource[] = []): CatalogRegistry {
  const sources: CatalogSource[] = []
  const resolved = new Map<string, MessageCatalog>()

  const registry: CatalogRegistry = {
    get sources() {
      return sources.map((source) => source.id)
    },

    get locales() {
      const locales = new Set<Locale>([SOURCE_LOCALE])
      for (const source of sources) {
        for (const tag of Object.keys(source.messages)) {
          const locale = normaliseLocale(tag)
          if (locale !== null) locales.add(locale)
        }
      }
      return [...locales].sort()
    },

    register(source) {
      const index = sources.findIndex((existing) => existing.id === source.id)
      if (index === -1) sources.push(source)
      else sources[index] = source
      resolved.clear()
    },

    catalogFor(locale) {
      const cached = resolved.get(locale)
      if (cached !== undefined) return cached

      const merged: Record<string, string> = {}
      const chain = [...localeChain(locale)].reverse()
      const lookup = [SOURCE_LOCALE, ...chain.filter((step) => step !== SOURCE_LOCALE)]

      for (const step of lookup) {
        for (const source of sources) {
          Object.assign(merged, catalogOf(source, step))
        }
      }

      const frozen = Object.freeze(merged)
      resolved.set(locale, frozen)
      return frozen
    },

    supports(locale) {
      const wanted = normaliseLocale(locale)
      if (wanted === null) return false
      return registry.locales.some((known) => known.toLowerCase() === wanted.toLowerCase())
    },
  }

  for (const source of initial) registry.register(source)

  return registry
}

function catalogOf(source: CatalogSource, locale: Locale): MessageCatalog {
  const exact = source.messages[locale]
  if (exact !== undefined) return exact

  const wanted = locale.toLowerCase()
  for (const [tag, catalog] of Object.entries(source.messages)) {
    if (tag.toLowerCase() === wanted) return catalog
  }

  return {}
}
