/**
 * The board's build-time registry (invariant 6).
 *
 * Everything installable is named here, statically, so the bundler can see it
 * and `tsc` can check it. Nothing is discovered by scanning a directory at
 * runtime — see `defineForumConfig` for why that is not merely a style
 * preference on a serverless target.
 *
 * Adding a theme or a plugin is: `pnpm add` it, add a line here, redeploy.
 * That is the honest install story the plugin manager (F69) explains on screen
 * rather than burying in docs.
 */
import { defineForumConfig } from '@forum/core'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  LIGHT_TOKENS,
} from '@forum/theme-default'

export default defineForumConfig({
  themes: {
    default: {
      key: 'default',
      title: 'Default',
      tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
      browserThemeColor: BROWSER_THEME_COLOR,
    },
  },
  defaultTheme: 'default',

  /*
   * Empty until F79 defines the plugin lifecycle. Present so the shape does not
   * change when the first plugin arrives — and so `forum.config.ts` is already
   * the file people look in.
   */
  plugins: [],
})
