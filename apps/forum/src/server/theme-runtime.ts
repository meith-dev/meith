import 'server-only'

/**
 * The board's palette, for every theme a member is allowed to pick.
 *
 * ## What a member's choice does and does not change
 *
 * It changes the **palette** — every design token, plus that theme's custom
 * CSS. It does not change the markup, because which slot components a build
 * contains is decided by `forum.config.ts` at build time (invariant 6) and
 * resolved once at module load in `theme.ts`. A board switches its *layout* by
 * changing `defaultTheme` and redeploying, exactly as it always did; what is new
 * is that the colours are no longer welded to that decision.
 *
 * This is stated plainly on the admin screen rather than buried here, because an
 * operator who installs a theme with a wildly different structure and offers it
 * to members deserves to know which half of it they are offering.
 *
 * ## Why it costs nothing per request
 *
 * The page ships every enabled theme's palette — the default's unscoped, the
 * rest under `[data-theme="<key>"]` — and a blocking inline script sets that
 * attribute from `localStorage` before first paint. So there is no cookie, no
 * per-viewer render, no round trip, and no flash of the wrong theme; the whole
 * cascade is one cached, tag-invalidated read shared by every visitor.
 *
 * The cost of that is bytes, and they are bounded by construction: a scoped
 * block carries only the tokens that theme *disagrees* with the default about
 * (see `renderBoardStyle`), and a board with one enabled theme emits exactly
 * what it emitted before any of this existed.
 */
import { CacheTags, env } from '@meith/core'
/*
 * Statically imported, not lazily required. Turbopack resolves `@meith/db` as
 * an async module, and a synchronous `require()` of one yields the pending
 * namespace rather than the exports — so `getDb` came back `undefined` and this
 * threw `TypeError: getDb is not a function` on every render. Importing opens
 * nothing: `getDb()` creates its client lazily and refuses in fixture mode,
 * which is the property the require was thought to be protecting. See
 * `container.ts` for the full account.
 */
import { PostgresThemeRepository, getDb, type ThemeRuntimeState } from '@meith/db'
import { DARK_TOKENS as DEFAULT_DARK, LIGHT_TOKENS as DEFAULT_LIGHT } from '@meith/theme-default'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

import forumConfig from '../../forum.config'

import { renderBoardStyle, type BoardTheme, type ThemeRuntimeStyle } from './theme-style'

/** One entry in the switcher a member sees. */
export interface ThemeChoice {
  readonly key: string
  readonly title: string
}

export interface BoardThemeStyle extends ThemeRuntimeStyle {
  /** Every theme a member may pick, in registry order. */
  readonly choices: readonly ThemeChoice[]
  /** The one a member who has picked nothing gets. */
  readonly defaultKey: string
}

const registered = Object.values(forumConfig.themes)
const buildTheme = forumConfig.themes[forumConfig.defaultTheme]!

/**
 * What `globals.css` has compiled into it (F78).
 *
 * The stylesheet can only carry one theme's values, and `tokens.test.ts` holds
 * them to the default theme *package's* — so that is the baseline every theme's
 * palette is emitted as a difference from. Importing the default theme here is
 * not a coupling to the board's choice of theme: it is a reference to the
 * contents of a stylesheet, which is what this constant is named for.
 */
const COMPILED_TOKENS = { light: DEFAULT_LIGHT, dark: DEFAULT_DARK }

/**
 * The board with nothing stored: every registered theme, exactly as it ships.
 *
 * Which is the same answer `composeBoard` gives an empty table, and that is the
 * point — this is the fallback for fixture mode and for a theme table that
 * cannot be read, and a fallback that quietly offered *fewer* themes than the
 * database path would is a fallback nobody would notice was in use.
 */
function shippedStyle(): BoardThemeStyle {
  return composeBoard([])
}

/**
 * Fold the stored rows into the registry.
 *
 * The registry is the list and storage is the exception to it — the same rule
 * F64's settings screen and F66's permission editor follow. A row for a theme
 * this build no longer contains is ignored rather than treated as an error: a
 * board that removes a theme from `forum.config.ts` and redeploys has made a
 * decision, and failing the render because the old row outlived it would turn a
 * tidy-up into an outage.
 */
function composeBoard(rows: readonly ThemeRuntimeState[]): BoardThemeStyle {
  const byKey = new Map(rows.map((row) => [row.key, row]))

  const enabled = registered.filter((theme) => byKey.get(theme.key)?.enabled !== false)

  /*
   * The build's own theme is always pickable, whatever the table says. It is
   * the one whose slots are actually rendering, so disabling it would leave a
   * board painting one theme's markup in another's colours with no way back —
   * and the row that did it is reachable only by SQL, since the screen refuses.
   */
  if (!enabled.some((theme) => theme.key === buildTheme.key)) enabled.unshift(buildTheme)

  const claimed = registered.find((theme) => byKey.get(theme.key)?.isDefault === true)
  const defaultKey =
    claimed !== undefined && enabled.includes(claimed) ? claimed.key : buildTheme.key

  const themes: BoardTheme[] = enabled.map((theme) => ({
    key: theme.key,
    tokens: theme.tokens,
    overrides: byKey.get(theme.key)?.tokenOverrides,
    customCss: byKey.get(theme.key)?.customCss ?? null,
  }))

  return {
    ...renderBoardStyle({ themes, defaultKey, baseline: COMPILED_TOKENS }),
    choices: enabled.map((theme) => ({ key: theme.key, title: theme.title })),
    defaultKey,
  }
}

/**
 * Tagged with **every** registered theme, not just the active one.
 *
 * One cache entry now holds every enabled theme's palette, so a save against
 * any of them has to drop it. Tagging only the default was correct when the
 * entry only contained the default; leaving it that way would mean editing an
 * alternate theme appeared to do nothing until something else invalidated.
 */
const loadPostgresBoardStyle = unstable_cache(
  async (): Promise<BoardThemeStyle> =>
    composeBoard(await new PostgresThemeRepository(getDb()).listRuntime()),
  ['board-theme-style'],
  { tags: registered.map((theme) => CacheTags.theme(theme.key)) },
)

/**
 * The one style block appended after the compiled theme defaults (F26).
 *
 * Memoised per request, because two things want it: the `<head>` style block
 * and the shell's appearance control, which needs the same list of enabled
 * themes. The `unstable_cache` below already makes the *database* read cheap;
 * this makes the composition itself happen once, the same shape `getActor` and
 * `getViewerPreferences` use.
 */
export const getBoardThemeStyle = cache(async (): Promise<BoardThemeStyle> => {
  if (env.DATA_SOURCE === 'fixture') return shippedStyle()

  /*
   * A theme table that cannot be read is a board that renders in the compiled
   * palette, not a board that does not render. Every other failure on this path
   * takes a page down for a colour, which is the wrong trade for something the
   * shell puts on every request including the error pages.
   */
  return loadPostgresBoardStyle().catch(() => shippedStyle())
})

/**
 * The palette alone, for `generateViewport` and anything else that does not
 * care which themes a member may pick.
 */
export async function getThemeRuntimeStyle(): Promise<ThemeRuntimeStyle> {
  return getBoardThemeStyle()
}
