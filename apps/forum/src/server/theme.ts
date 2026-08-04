import 'server-only'

/**
 * The board's resolved theme (F25/F27).
 *
 * Resolved once at module load from the static registry: the `extends` chain
 * cannot change at runtime, so doing this per request would be work with no
 * possible different answer.
 *
 * Every layout and page reads the theme *here*, never by importing
 * `@meith/theme-default` — invariant 6, and the practical reason is that
 * installing a second theme must be a line in `forum.config.ts` and a redeploy,
 * not an edit to every file that renders a slot.
 */
import { assertThemeContract, resolveTheme, type ResolvedTheme } from '@meith/theme-kit'

import forumConfig from '../../forum.config'

/**
 * The `!`s are load-bearing rather than lazy.
 *
 * `defineForumConfig` has already proven `defaultTheme` names a registered
 * theme. `theme` is optional in the registry because a token-only theme is
 * legitimate (F26 restyles a board without touching markup) — but a board whose
 * active theme fills no slots cannot render a page at all, so failing at boot
 * with a clear stack is right. The alternative is a blank page at request time.
 */
export const activeTheme: ResolvedTheme = resolveTheme(
  forumConfig.themes[forumConfig.defaultTheme]!.theme!,
)

/**
 * F77 — a theme with a hole in it fails the deployment, not the page.
 *
 * `requireSlot` already throws naming the slot, but it throws on the request
 * that reaches the page: install a theme missing `MemberProfile` and the board
 * looks perfect until somebody clicks a username, possibly days later. This runs
 * at module load, so the same mistake is a boot failure with the whole list in
 * one message.
 *
 * It asks for the **v1 contract**, not for completeness: two slots belong to F45
 * and no theme can fill them. See `SLOT_STABILITY`.
 */
assertThemeContract(activeTheme)
