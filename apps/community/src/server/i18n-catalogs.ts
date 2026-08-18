import 'server-only'

import {
  BOARD_CATALOG,
  createCatalogRegistry,
  createTranslator,
  type Translator,
} from '@meith/i18n'

import { resolveLocale } from '@/view/locale'

import forumConfig from '../../community.config'
import { getSettings } from './settings'

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

export async function translatorForLocale(locale: string): Promise<Translator> {
  const settings = await getSettings()
  const resolved = resolveLocale({
    stored: locale,
    accepted: null,
    boardDefault: settings.get('display.default_locale'),
    supported: catalogs.locales,
  })

  return createTranslator({
    locale: resolved.locale,
    catalog: catalogs.catalogFor(resolved.locale),
  })
}
