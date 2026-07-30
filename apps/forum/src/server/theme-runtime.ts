import 'server-only'

import { CacheTags, env } from '@forum/core'
import { unstable_cache } from 'next/cache'

import forumConfig from '../../forum.config'

import { renderThemeStyle, type ThemeRuntimeStyle } from './theme-style'

const installedTheme = forumConfig.themes[forumConfig.defaultTheme]!

const loadPostgresThemeStyle = unstable_cache(
  async (): Promise<ThemeRuntimeStyle> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- Postgres is absent in fixture builds.
    const { getDb, PostgresThemeRepository } = require('@forum/db') as typeof import('@forum/db')
    const runtime = await new PostgresThemeRepository(getDb()).findRuntimeByKey(installedTheme.key)
    return renderThemeStyle(
      installedTheme.tokens,
      runtime?.tokenOverrides,
      runtime?.customCss ?? null,
    )
  },
  ['theme-runtime-style', installedTheme.key],
  { tags: [CacheTags.theme(installedTheme.key)] },
)

/** The one style block appended after the compiled theme defaults (F26). */
export async function getThemeRuntimeStyle(): Promise<ThemeRuntimeStyle> {
  if (env.DATA_SOURCE === 'fixture') {
    return renderThemeStyle(installedTheme.tokens, undefined, null)
  }
  return loadPostgresThemeStyle()
}
