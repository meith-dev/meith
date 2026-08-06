import { defineForumConfig } from '@meith/core'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultTheme,
  LIGHT_TOKENS,
} from '@meith/theme-default'
import {
  BROWSER_THEME_COLOR as MIDNIGHT_BROWSER_THEME_COLOR,
  DARK_TOKENS as MIDNIGHT_DARK_TOKENS,
  LIGHT_TOKENS as MIDNIGHT_LIGHT_TOKENS,
  midnightTheme,
} from '@meith/theme-midnight'

export default defineForumConfig({
  themes: {
    default: {
      key: 'default',
      title: 'Default',
      tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
      browserThemeColor: BROWSER_THEME_COLOR,
      theme: defaultTheme,
    },
    midnight: {
      key: 'midnight',
      title: 'Midnight',
      tokens: { light: MIDNIGHT_LIGHT_TOKENS, dark: MIDNIGHT_DARK_TOKENS },
      browserThemeColor: MIDNIGHT_BROWSER_THEME_COLOR,
      theme: midnightTheme,
    },
  },
  defaultTheme: 'default',

  plugins: [],
})
