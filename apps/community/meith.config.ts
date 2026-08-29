import { defineForumConfig } from '@meith/core'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultMessages,
  defaultTheme,
  LIGHT_TOKENS,
} from '@meith/theme-default'

import { SHOWCASE_THEMES, showcaseEnabled } from './meith.demo.config'
import { INSTALLED_PLUGINS } from './meith.plugins'

export default defineForumConfig({
  themes: {
    default: {
      key: 'default',
      title: 'Default',
      tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
      browserThemeColor: BROWSER_THEME_COLOR,
      theme: defaultTheme,
      messages: defaultMessages,
    },
    ...(showcaseEnabled() ? SHOWCASE_THEMES : {}),
  },
  defaultTheme: 'default',

  plugins: INSTALLED_PLUGINS,
})
