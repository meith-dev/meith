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
      /*
       * The slot map (F25). Layouts resolve the board's theme through this entry,
       * so installing a second theme is a line here and a redeploy — never an
       * edit to a layout that has a theme's components imported into it.
       */
      theme: defaultTheme,
    },
    /*
     * F78's second theme — registered, not active.
     *
     * Switching the board to it is changing `defaultTheme` below and
     * redeploying; there is no runtime switcher, for the reasons F68 sets out.
     * Registering it anyway is what makes the promise real rather than
     * theoretical: `contract.test.ts` reads this map, so midnight is driven
     * through every stable slot on every CI run whether or not a board uses it.
     */
    midnight: {
      key: 'midnight',
      title: 'Midnight',
      tokens: { light: MIDNIGHT_LIGHT_TOKENS, dark: MIDNIGHT_DARK_TOKENS },
      browserThemeColor: MIDNIGHT_BROWSER_THEME_COLOR,
      theme: midnightTheme,
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
