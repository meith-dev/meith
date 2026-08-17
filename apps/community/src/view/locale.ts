import { AUTOMATIC_LOCALE } from '@meith/accounts'
import { type Locale, negotiateLocale, normaliseLocale, parseAcceptLanguage } from '@meith/i18n'

export interface ResolvedLocale {
  readonly locale: Locale
  readonly isAutomatic: boolean
}

export function resolveLocale(input: {
  readonly stored?: string | null | undefined
  readonly accepted?: string | null | undefined
  readonly boardDefault?: string | null | undefined
  readonly supported: readonly Locale[]
}): ResolvedLocale {
  const fallback = normaliseLocale(input.boardDefault) ?? 'en'
  const stored = input.stored ?? null

  if (stored !== null && stored !== AUTOMATIC_LOCALE) {
    const chosen = normaliseLocale(stored)
    if (chosen !== null) {
      return {
        locale: negotiateLocale({
          requested: [chosen],
          supported: input.supported,
          fallback,
        }),
        isAutomatic: false,
      }
    }
  }

  return {
    locale: negotiateLocale({
      requested: parseAcceptLanguage(input.accepted).map((entry) => entry.locale),
      supported: input.supported,
      fallback,
    }),
    isAutomatic: true,
  }
}
