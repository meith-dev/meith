import { defineForumConfig } from '@meith/core'

import { INSTALLED_PLUGINS } from './community.plugins'
import { SHOWCASE_THEMES, showcaseEnabled } from './community.demo.config'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultTheme,
  LIGHT_TOKENS,
} from '@meith/theme-default'

export default defineForumConfig({
  themes: {
    default: {
      key: 'default',
      title: 'Default',
      tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
      browserThemeColor: BROWSER_THEME_COLOR,
      theme: defaultTheme,
    },
    ...(showcaseEnabled() ? SHOWCASE_THEMES : {}),
  },
  defaultTheme: 'default',

  plugins: INSTALLED_PLUGINS,
})
