import {
  BROWSER_THEME_COLOR as CLUBHOUSE_BROWSER_THEME_COLOR,
  DARK_TOKENS as CLUBHOUSE_DARK_TOKENS,
  LIGHT_TOKENS as CLUBHOUSE_LIGHT_TOKENS,
  clubhouseMessages,
  clubhouseTheme,
} from '@meith/theme-clubhouse'
import {
  BROWSER_THEME_COLOR as MIDNIGHT_BROWSER_THEME_COLOR,
  DARK_TOKENS as MIDNIGHT_DARK_TOKENS,
  LIGHT_TOKENS as MIDNIGHT_LIGHT_TOKENS,
  midnightMessages,
  midnightTheme,
} from '@meith/theme-midnight'
import {
  BROWSER_THEME_COLOR as PHASEBOOK_BROWSER_THEME_COLOR,
  DARK_TOKENS as PHASEBOOK_DARK_TOKENS,
  LIGHT_TOKENS as PHASEBOOK_LIGHT_TOKENS,
  phasebookMessages,
  phasebookTheme,
} from '@meith/theme-phasebook'
import {
  BROWSER_THEME_COLOR as RAIDFRAME_BROWSER_THEME_COLOR,
  DARK_TOKENS as RAIDFRAME_DARK_TOKENS,
  LIGHT_TOKENS as RAIDFRAME_LIGHT_TOKENS,
  raidframeMessages,
  raidframeTheme,
} from '@meith/theme-raidframe'

export const SHOWCASE_THEMES = {
  midnight: {
    key: 'midnight',
    title: 'Midnight',
    tokens: { light: MIDNIGHT_LIGHT_TOKENS, dark: MIDNIGHT_DARK_TOKENS },
    browserThemeColor: MIDNIGHT_BROWSER_THEME_COLOR,
    theme: midnightTheme,
    messages: midnightMessages,
  },
  phasebook: {
    key: 'phasebook',
    title: 'Phasebook',
    tokens: { light: PHASEBOOK_LIGHT_TOKENS, dark: PHASEBOOK_DARK_TOKENS },
    browserThemeColor: PHASEBOOK_BROWSER_THEME_COLOR,
    theme: phasebookTheme,
    messages: phasebookMessages,
  },
  raidframe: {
    key: 'raidframe',
    title: 'Raidframe',
    tokens: { light: RAIDFRAME_LIGHT_TOKENS, dark: RAIDFRAME_DARK_TOKENS },
    browserThemeColor: RAIDFRAME_BROWSER_THEME_COLOR,
    theme: raidframeTheme,
    messages: raidframeMessages,
  },
  clubhouse: {
    key: 'clubhouse',
    title: 'Clubhouse',
    tokens: { light: CLUBHOUSE_LIGHT_TOKENS, dark: CLUBHOUSE_DARK_TOKENS },
    browserThemeColor: CLUBHOUSE_BROWSER_THEME_COLOR,
    theme: clubhouseTheme,
    messages: clubhouseMessages,
  },
} as const

export function showcaseEnabled(): boolean {
  const flag = process.env.SHOWCASE_THEMES
  return flag === '1' || flag === 'true'
}
