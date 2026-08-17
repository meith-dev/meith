import type { MessageCatalog } from './catalog'
import { type Locale, SOURCE_LOCALE } from './locale'
import { formatMessage, type MessageArgs, pluralCategory } from './message'

export const DEFAULT_TIME_ZONE = 'UTC'

export interface Translator {
  readonly locale: Locale
  readonly timeZone: string
  t(key: string, args?: MessageArgs): string
  has(key: string): boolean
  pattern(key: string): string | undefined
  number(value: number, options?: Intl.NumberFormatOptions): string
  list(items: readonly string[], options?: Intl.ListFormatOptions): string
  parts(value: Date, options: Intl.DateTimeFormatOptions): string
  plural(value: number, ordinal?: boolean): string
}

export interface TranslatorInput {
  readonly locale: Locale
  readonly catalog: MessageCatalog
  readonly timeZone?: string
}

export function createTranslator(input: TranslatorInput): Translator {
  const locale = input.locale
  const timeZone = usableTimeZone(input.timeZone)
  const context = { locale, timeZone }

  return {
    locale,
    timeZone,

    t(key, args = {}) {
      const pattern = input.catalog[key]
      if (pattern === undefined) return key

      try {
        return formatMessage(pattern, args, context)
      } catch {
        return pattern
      }
    },

    has(key) {
      return input.catalog[key] !== undefined
    },

    pattern(key) {
      return input.catalog[key]
    },

    number(value, options) {
      return new Intl.NumberFormat(locale, options).format(value)
    },

    list(items, options) {
      return new Intl.ListFormat(locale, options).format(items)
    },

    parts(value, options) {
      return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(value)
    },

    plural(value, ordinal = false) {
      return pluralCategory(locale, value, ordinal)
    },
  }
}

export function usableTimeZone(timeZone: string | null | undefined): string {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return DEFAULT_TIME_ZONE

  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0)
    return timeZone
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

export function sourceTranslator(catalog: MessageCatalog, timeZone?: string): Translator {
  return createTranslator({
    locale: SOURCE_LOCALE,
    catalog,
    ...(timeZone === undefined ? {} : { timeZone }),
  })
}
