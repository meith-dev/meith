import 'server-only'

import { CacheTags, env } from '@meith/core'
import { PostgresThemeRepository, getDb, type ThemeRuntimeState } from '@meith/db'
import { DARK_TOKENS as DEFAULT_DARK, LIGHT_TOKENS as DEFAULT_LIGHT } from '@meith/theme-default'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

import forumConfig from '../../community.config'

import { renderBoardStyle, type BoardTheme, type ThemeRuntimeStyle } from './theme-style'

export interface ThemeChoice {
  readonly key: string
  readonly title: string
}

export interface BoardThemeStyle extends ThemeRuntimeStyle {
  readonly choices: readonly ThemeChoice[]
  readonly defaultKey: string
}

const registered = Object.values(forumConfig.themes)
const buildTheme = forumConfig.themes[forumConfig.defaultTheme]!

const COMPILED_TOKENS = { light: DEFAULT_LIGHT, dark: DEFAULT_DARK }

function shippedStyle(): BoardThemeStyle {
  return composeBoard([])
}

function composeBoard(rows: readonly ThemeRuntimeState[]): BoardThemeStyle {
  const byKey = new Map(rows.map((row) => [row.key, row]))

  const enabled = registered.filter((theme) => byKey.get(theme.key)?.enabled !== false)

  if (!enabled.some((theme) => theme.key === buildTheme.key)) enabled.unshift(buildTheme)

  const claimed = registered.find((theme) => byKey.get(theme.key)?.isDefault === true)
  const defaultKey =
    claimed !== undefined && enabled.includes(claimed) ? claimed.key : buildTheme.key

  const themes: BoardTheme[] = enabled.map((theme) => ({
    key: theme.key,
    tokens: theme.tokens,
    overrides: byKey.get(theme.key)?.tokenOverrides,
    customCss: byKey.get(theme.key)?.customCss ?? null,
  }))

  return {
    ...renderBoardStyle({ themes, defaultKey, baseline: COMPILED_TOKENS }),
    choices: enabled.map((theme) => ({ key: theme.key, title: theme.title })),
    defaultKey,
  }
}

const loadPostgresBoardStyle = unstable_cache(
  async (): Promise<BoardThemeStyle> =>
    composeBoard(await new PostgresThemeRepository(getDb()).listRuntime()),
  ['board-theme-style'],
  { tags: registered.map((theme) => CacheTags.theme(theme.key)) },
)

export const getBoardThemeStyle = cache(async (): Promise<BoardThemeStyle> => {
  if (env.DATA_SOURCE === 'fixture') return shippedStyle()

  return loadPostgresBoardStyle().catch(() => shippedStyle())
})

export async function getThemeRuntimeStyle(): Promise<ThemeRuntimeStyle> {
  return getBoardThemeStyle()
}
