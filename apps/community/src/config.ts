/**
 * `@meith/web/config` — the surface a board's own `community.config.ts`
 * builds against.
 *
 * A scaffolded board depends on `@meith/web` for the app itself, and imports
 * its board-time registry through this subpath rather than reaching into
 * `@meith/core` directly. That indirection is what lets `@meith/web` change
 * which package actually defines `defineForumConfig` without every board's
 * `community.config.ts` following along.
 */

export type { ForumConfig, InstalledPlugin, InstalledTheme, MessageBundle } from '@meith/core'
export { defineForumConfig } from '@meith/core'
