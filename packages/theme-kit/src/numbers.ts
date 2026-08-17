import { cache } from 'react'

import { type Locale, SOURCE_LOCALE } from '@meith/i18n'

const holder = cache((): { locale: Locale } => ({ locale: SOURCE_LOCALE }))

export function adoptRenderLocale(locale: Locale): void {
  holder().locale = locale
}

export function renderLocale(): Locale {
  return holder().locale
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(renderLocale()).format(value)
}
