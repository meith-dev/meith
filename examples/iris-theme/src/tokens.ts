/**
 * The iris palette — the default theme, rebranded violet.
 *
 * This is the smallest real recolour a theme can be, and it is the one the
 * theme API is designed around (docs/theme-api.md, "The default theme's
 * palette is neutral on purpose"): every greyscale token the default ships is
 * at chroma zero, so a brand is one group of tokens — `primary`,
 * `primary-hover`, `primary-foreground`, `ring` — and nothing else in the
 * palette carries a hue to fight the result.
 *
 * ## Spreading the default is the point here, and it differs from midnight
 *
 * `themes/midnight` writes out every token by hand, because its palette is its
 * own statement and it wants a token added upstream to fail its sync test
 * rather than silently arrive unstyled. A *recolour* wants the opposite: for
 * every token it has no opinion about, the default's choice — today's and
 * tomorrow's — is the right value. So this file spreads the default's records
 * and overrides only the brand group.
 *
 * ## The values are measured, not eyeballed
 *
 * Every pair the board paints is checked against WCAG AA by
 * `apps/community/src/view/contrast.test.ts`, which reads the theme registry —
 * registering this theme enrolled it. The violets below keep (roughly) the
 * default greens' lightness, so the button label, the hovered button and the
 * focus ring all clear their thresholds with room. If you change a value, that
 * test names the pair you broke.
 */

import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
} from '@meith/theme-default'

export const LIGHT_TOKENS: Record<string, string> = {
  ...DEFAULT_LIGHT,
  primary: 'oklch(0.49 0.19 300)',
  'primary-hover': 'oklch(0.42 0.17 300)',
  ring: 'oklch(0.49 0.19 300)',
}

export const DARK_TOKENS: Record<string, string> = {
  ...DEFAULT_DARK,
  primary: 'oklch(0.78 0.12 300)',
  'primary-foreground': 'oklch(0.18 0.03 300)',
  'primary-hover': 'oklch(0.84 0.11 300)',
  ring: 'oklch(0.78 0.12 300)',
}

/**
 * `<meta name="theme-color">` needs a literal sRGB hex (Safari ignores
 * `oklch()` there), and it must equal the two `background` tokens converted.
 * Iris inherits the default's backgrounds unchanged, so it re-exports the
 * default's pair rather than owning a copy that could go stale.
 */
export { BROWSER_THEME_COLOR } from '@meith/theme-default'
