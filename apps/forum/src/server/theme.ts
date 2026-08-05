import 'server-only'

/**
 * The theme this request renders (F25/F27).
 *
 * ## Why this is per request now, and why that is cheap
 *
 * It used to be a module-level constant, on the argument that "a control that
 * appeared to switch themes would either not work or would cost every first
 * paint a database read". The first half was never true — `extends` chains are
 * static, but *which* static chain to use is a per-request choice like any
 * other — and the second half stopped being true a long time before anybody
 * checked: **91 of the board's 92 routes are already `ƒ (Dynamic)`**, because
 * `PageShell` resolves the viewer, which reads a cookie. Only `/_not-found` was
 * static. There was no static rendering left to protect.
 *
 * So the theme is resolved from a cookie, per request, memoised with
 * `React.cache` the same way `getActor` and `getViewerPreferences` are. A page
 * that asks for six slots reads it once.
 *
 * ## Every registered theme is resolved at module load, not just the board's
 *
 * `resolveTheme` walks an `extends` chain, which genuinely cannot change
 * between requests — so all of that work still happens once, at import, for
 * every theme in the registry. What varies per request is only *which*
 * already-resolved map is handed back.
 *
 * `assertThemeContract` therefore runs over all of them. That is a deliberate
 * tightening: an incomplete alternate theme used to be a latent 500 on whatever
 * page reached its missing slot, and now that a member can pick it, it is a
 * boot failure with the whole list in one message — which is the same promise
 * F77 made about the board's own theme, extended to every theme a member can
 * actually reach.
 *
 * ## A theme with no slot map is a palette, and that is a real thing to be
 *
 * `theme` is optional in the registry: a theme may ship tokens and nothing
 * else, which is how a board offers three looks without three sets of
 * components. Picking one of those changes the colours and keeps the board's
 * markup — not a compromise, but the whole definition of that kind of theme.
 * `RESOLVED` holds only the themes that have slots, and the fallback below is
 * what makes a palette-only choice behave correctly rather than throw.
 */
import { cookies } from 'next/headers'
import { cache } from 'react'

import { assertThemeContract, resolveTheme, type ResolvedTheme } from '@meith/theme-kit'

import forumConfig from '../../forum.config'

import { getBoardThemeStyle } from './theme-runtime'
import { SCHEME_COOKIE, THEME_COOKIE, isColourScheme, type ColourSchemePreference } from '@/view/theme-preference'

/** Every registered theme that has components, resolved once. */
const RESOLVED: ReadonlyMap<string, ResolvedTheme> = new Map(
  Object.values(forumConfig.themes)
    .filter((theme) => theme.theme !== undefined)
    .map((theme) => [theme.key, resolveTheme(theme.theme!)]),
)

/**
 * The theme whose components this build renders when nothing else is chosen.
 *
 * The `!` is load-bearing rather than lazy. `defineForumConfig` has already
 * proven `defaultTheme` names a registered theme, and a board whose build theme
 * fills no slots cannot render a page at all — so failing at boot with a clear
 * stack is right. The alternative is a blank page at request time.
 */
export const buildTheme: ResolvedTheme = RESOLVED.get(forumConfig.defaultTheme)!

if (buildTheme === undefined) {
  throw new Error(
    `forum.config.ts: defaultTheme "${forumConfig.defaultTheme}" fills no slots, so this ` +
      'board cannot render a page. A token-only theme is legitimate as an alternate, ' +
      'never as the theme a build is made of.',
  )
}

/**
 * F77 — a theme with a hole in it fails the deployment, not the page.
 *
 * `requireSlot` already throws naming the slot, but it throws on the request
 * that reaches the page: install a theme missing `MemberProfile` and the board
 * looks perfect until somebody clicks a username, possibly days later. This
 * runs at module load, so the same mistake is a boot failure with the whole
 * list in one message.
 *
 * It asks for the **slot contract**, not for completeness: two slots belong to
 * F45 and no theme can fill them. See `SLOT_STABILITY`.
 */
for (const theme of RESOLVED.values()) assertThemeContract(theme)

/**
 * The key this request's viewer has chosen, or the board's default.
 *
 * Checked against the **enabled** list rather than the registry, so a theme an
 * administrator has turned off stops rendering for the people who chose it
 * without anybody having to clear their cookie. An unknown value is the board
 * default, not an error: the cookie is client-writable by definition and a
 * board that 500s on a bad one is a board anybody can break.
 */
export const currentThemeKey = cache(async (): Promise<string> => {
  const { choices, defaultKey } = await getBoardThemeStyle()
  const chosen = (await cookies()).get(THEME_COOKIE)?.value

  return chosen !== undefined && choices.some((choice) => choice.key === chosen)
    ? chosen
    : defaultKey
})

/**
 * The resolved slot map this request renders.
 *
 * Falls back to the build's theme when the chosen one has no components — the
 * palette-only case above. Its tokens still apply, because those are emitted by
 * `theme-runtime.ts` from the same key.
 */
export const currentTheme = cache(async (): Promise<ResolvedTheme> => {
  return RESOLVED.get(await currentThemeKey()) ?? buildTheme
})

/** Light, dark, or whatever the reader's operating system says. */
export const currentColourScheme = cache(async (): Promise<ColourSchemePreference> => {
  const chosen = (await cookies()).get(SCHEME_COOKIE)?.value
  return isColourScheme(chosen) ? chosen : 'system'
})
