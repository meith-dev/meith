/**
 * The stock board's build-time registry.
 *
 * This mirrors apps/community/community.config.ts exactly — same default
 * theme, same env-gated showcase themes, same env-gated demo/test plugins —
 * so the image docker/Dockerfile builds from this workspace behaves exactly
 * like the one previously built straight from apps/community. See
 * docs/architecture.md, "The board-config seam".
 *
 * `defineForumConfig` is imported through `@meith/web/config` rather than
 * `@meith/core` directly: that subpath is the seam a board outside this
 * monorepo builds against (see apps/community/src/config.ts), and this board
 * is shaped like one — a workspace with its own package.json depending on
 * `@meith/web`, built through the same `forum-web build` any board uses.
 */
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultMessages,
  defaultTheme,
  LIGHT_TOKENS,
} from '@meith/theme-default'
import { defineForumConfig } from '@meith/web/config'

import { SHOWCASE_THEMES, showcaseEnabled } from './community.demo.config'
import { INSTALLED_PLUGINS } from './community.plugins'

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
