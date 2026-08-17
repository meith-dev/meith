import 'server-only'

import { headers } from 'next/headers'
import { cache } from 'react'

import {
  BOARD_CATALOG,
  createCatalogRegistry,
  createTranslator,
  type Translator,
} from '@meith/i18n'

import { type ResolvedLocale, resolveLocale } from '@/view/locale'

import forumConfig from '../../community.config'
import { getSettings } from './settings'
import { getViewerPreferences } from './viewer-preferences'

export const catalogs = createCatalogRegistry([
  BOARD_CATALOG,
  ...Object.values(forumConfig.themes).flatMap((theme) =>
    theme.messages === undefined ? [] : [{ id: `theme:${theme.key}`, messages: theme.messages }],
  ),
  ...(forumConfig.plugins ?? []).flatMap((entry) =>
    entry.enabled === false || entry.messages === undefined
      ? []
      : [{ id: `plugin:${entry.key}`, messages: entry.messages }],
  ),
  ...(forumConfig.messages === undefined ? [] : [{ id: 'board', messages: forumConfig.messages }]),
])

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
  } catch {
    /* the board default is unreadable before install; the source locale stands in */
  }

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
