import 'server-only'

import forumConfig from '@board/config'
import { cookies } from 'next/headers'
import { cache } from 'react'

import { assertThemeContract, type ResolvedTheme, resolveTheme } from '@meith/theme-kit'

import {
  type ColourSchemePreference,
  isColourScheme,
  SCHEME_COOKIE,
  THEME_COOKIE,
} from '@/view/theme-preference'

import { getBoardThemeStyle } from './theme-runtime'

const RESOLVED: ReadonlyMap<string, ResolvedTheme> = new Map(
  Object.values(forumConfig.themes)
    .filter((theme) => theme.theme !== undefined)
    .map((theme) => [theme.key, resolveTheme(theme.theme!)]),
)

export const buildTheme: ResolvedTheme = RESOLVED.get(forumConfig.defaultTheme)!

if (buildTheme === undefined) {
  throw new Error(
    `meith.config.ts: defaultTheme "${forumConfig.defaultTheme}" fills no slots, so this ` +
      'board cannot render a page. A token-only theme is legitimate as an alternate, ' +
      'never as the theme a build is made of.',
  )
}

for (const theme of RESOLVED.values()) assertThemeContract(theme)

export const currentThemeKey = cache(async (): Promise<string> => {
  const { choices, defaultKey } = await getBoardThemeStyle()
  const chosen = (await cookies()).get(THEME_COOKIE)?.value

  return chosen !== undefined && choices.some((choice) => choice.key === chosen)
    ? chosen
    : defaultKey
})

export const currentTheme = cache(async (): Promise<ResolvedTheme> => {
  return RESOLVED.get(await currentThemeKey()) ?? buildTheme
})

export const currentColourScheme = cache(async (): Promise<ColourSchemePreference> => {
  const chosen = (await cookies()).get(SCHEME_COOKIE)?.value
  return isColourScheme(chosen) ? chosen : 'system'
})
