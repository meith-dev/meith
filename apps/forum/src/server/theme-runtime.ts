import 'server-only'

import { CacheTags, env } from '@forum/core'
/*
 * Statically imported, not lazily required. Turbopack resolves `@forum/db` as
 * an async module, and a synchronous `require()` of one yields the pending
 * namespace rather than the exports — so `getDb` came back `undefined` and this
 * threw `TypeError: getDb is not a function` on every render. Importing opens
 * nothing: `getDb()` creates its client lazily and refuses in fixture mode,
 * which is the property the require was thought to be protecting. See
 * `container.ts` for the full account.
 */
import { PostgresThemeRepository, getDb } from '@forum/db'
import { unstable_cache } from 'next/cache'

import forumConfig from '../../forum.config'

import { renderThemeStyle, type ThemeRuntimeStyle } from './theme-style'

const installedTheme = forumConfig.themes[forumConfig.defaultTheme]!

const loadPostgresThemeStyle = unstable_cache(
  async (): Promise<ThemeRuntimeStyle> => {
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
