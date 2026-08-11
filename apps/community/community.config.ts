import { defineForumConfig } from '@meith/core'

import { INSTALLED_PLUGINS } from './community.plugins'
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
import {
  BROWSER_THEME_COLOR as PHASEBOOK_BROWSER_THEME_COLOR,
  DARK_TOKENS as PHASEBOOK_DARK_TOKENS,
  LIGHT_TOKENS as PHASEBOOK_LIGHT_TOKENS,
  phasebookTheme,
} from '@meith/theme-phasebook'

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
    phasebook: {
      key: 'phasebook',
      title: 'Phasebook',
      tokens: { light: PHASEBOOK_LIGHT_TOKENS, dark: PHASEBOOK_DARK_TOKENS },
      browserThemeColor: PHASEBOOK_BROWSER_THEME_COLOR,
      theme: phasebookTheme,
    },
  },
  defaultTheme: 'default',

  plugins: INSTALLED_PLUGINS,
})
