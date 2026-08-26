import 'server-only'

import { headers } from 'next/headers'
import { cache } from 'react'

import type { MessageResolver } from '@meith/core'
import { createTranslator, type Translator } from '@meith/i18n'

import { type ResolvedLocale, resolveLocale } from '@/view/locale'

import { catalogs, translatorForLocale } from './i18n-catalogs'
import { getSettings } from './settings'
import { getViewerPreferences } from './viewer-preferences'

export { catalogs, translatorForLocale }

const acceptedLanguages = cache(async (): Promise<string | null> => {
  try {
    return (await headers()).get('accept-language')
  } catch {
    return null
  }
})

export const getLocale = cache(async (): Promise<ResolvedLocale> => {
  const [preferences, accepted] = await Promise.all([
    getViewerPreferences().catch(() => null),
    acceptedLanguages(),
  ])

  let boardDefault: string | null = null
  try {
    boardDefault = (await getSettings()).get('display.default_locale')
  } catch {}

  return resolveLocale({
    stored: preferences?.locale ?? null,
    accepted,
    boardDefault,
    supported: catalogs.locales,
  })
})

export const getTranslator = cache(async (): Promise<Translator> => {
  const [{ locale }, preferences] = await Promise.all([
    getLocale(),
    getViewerPreferences().catch(() => null),
  ])

  return createTranslator({
    locale,
    catalog: catalogs.catalogFor(locale),
    ...(preferences === null ? {} : { timeZone: preferences.timezone }),
  })
})

export const getMessageResolver = cache(async (): Promise<MessageResolver> => {
  const translator = await getTranslator()
  return (key, args) => (translator.has(key) ? translator.t(key, args) : undefined)
})

export async function tr(
  key: string,
  args?: Readonly<Record<string, string | number>>,
): Promise<string> {
  return (await getTranslator()).t(key, args)
}
