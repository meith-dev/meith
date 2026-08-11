import {
  BROWSER_THEME_COLOR as MIDNIGHT_BROWSER_THEME_COLOR,
  DARK_TOKENS as MIDNIGHT_DARK_TOKENS,
  LIGHT_TOKENS as MIDNIGHT_LIGHT_TOKENS,
  midnightTheme,
} from '@meith/theme-midnight'
import {
  BROWSER_THEME_COLOR as PHASEBOOK_BROWSER_THEME_COLOR,
  DARK_TOKENS as PHASEBOOK_DARK_TOKENS,
  LIGHT_TOKENS as PHASEBOOK_LIGHT_TOKENS,
  phasebookTheme,
} from '@meith/theme-phasebook'
import {
  BROWSER_THEME_COLOR as THISCORD_BROWSER_THEME_COLOR,
  DARK_TOKENS as THISCORD_DARK_TOKENS,
  LIGHT_TOKENS as THISCORD_LIGHT_TOKENS,
  thiscordTheme,
} from '@meith/theme-thiscord'

export const SHOWCASE_THEMES = {
  midnight: {
    key: 'midnight',
    title: 'Midnight',
    tokens: { light: MIDNIGHT_LIGHT_TOKENS, dark: MIDNIGHT_DARK_TOKENS },
    browserThemeColor: MIDNIGHT_BROWSER_THEME_COLOR,
    theme: midnightTheme,
  },
  phasebook: {
    key: 'phasebook',
    title: 'Phasebook',
    tokens: { light: PHASEBOOK_LIGHT_TOKENS, dark: PHASEBOOK_DARK_TOKENS },
    browserThemeColor: PHASEBOOK_BROWSER_THEME_COLOR,
    theme: phasebookTheme,
  },
  thiscord: {
    key: 'thiscord',
    title: 'Thiscord',
    tokens: { light: THISCORD_LIGHT_TOKENS, dark: THISCORD_DARK_TOKENS },
    browserThemeColor: THISCORD_BROWSER_THEME_COLOR,
    theme: thiscordTheme,
  },
} as const

export function showcaseEnabled(): boolean {
  const flag = process.env.SHOWCASE_THEMES
  return flag === '1' || flag === 'true'
}
