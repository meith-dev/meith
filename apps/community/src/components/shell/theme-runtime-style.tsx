import { getBoardThemeStyle } from '@/server/theme-runtime'

/**
 * Every enabled theme's palette, in one style block.
 *
 * The board default's values go in unscoped and every other enabled theme's
 * under `[data-theme="<key>"]` — the attribute the root layout has already set
 * from the viewer's cookie. So the right palette is selected by the HTML that
 * arrives rather than by a script that runs after it, and there is nothing to
 * flash.
 *
 * Shipping the alternates as well as the chosen one is deliberate and cheap: a
 * scoped block carries only the tokens that theme *disagrees with the default
 * about*, a board with one enabled theme emits exactly what it always did, and
 * one cache entry serves every viewer regardless of what any of them picked.
 */
export async function ThemeRuntimeStyle() {
  const { css } = await getBoardThemeStyle()
  return css === '' ? null : <style id="community-theme-overrides">{css}</style>
}
