/**
 * A member's own appearance choice.
 *
 * Two decisions, stored separately because they are separate questions:
 *
 *  - **which theme** — one of the keys the board has enabled;
 *  - **which colour scheme** — light, dark, or whatever the operating system
 *    says, which is the default and is what every reader got before this
 *    existed. `globals.css` has carried the `prefers-color-scheme` block since
 *    the beginning, and nothing had ever set the class that overrides it.
 *
 * ## Why cookies rather than `localStorage`
 *
 * Because the theme decides the **markup**, not only the colours, and markup is
 * rendered on the server. `localStorage` is invisible to the server, so a
 * board using it could only ever repaint after the page arrived — which is a
 * theme switcher that switches half a theme.
 *
 * The objection to a cookie was that reading one makes every page dynamic. That
 * objection is obsolete: 91 of the board's 92 routes are already dynamic
 * because `PageShell` resolves the viewer. There is no static rendering left to
 * pay for.
 *
 * And the cookie buys something `localStorage` cannot: the switcher is an
 * ordinary form posting to a Server Action, so **it works with JavaScript
 * off**, like everything else on this board (D06). There is no pre-paint
 * script, no flash, and no client bundle for it at all.
 *
 * Neither cookie is `httpOnly` in any meaningful sense — they are display
 * preferences a reader is welcome to set by hand — so both are validated where
 * they are read: the theme against the board's enabled list, the scheme against
 * the three values below.
 */

export const THEME_COOKIE = 'meith_theme'
export const SCHEME_COOKIE = 'meith_scheme'

/**
 * A year, and refreshed on every change.
 *
 * A session cookie would lose the choice when the browser closed, which for a
 * member who reads a board on a laptop is "it forgets every evening".
 */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** `system` is the absence of a choice, and it is the default. */
export const COLOUR_SCHEMES = ['system', 'light', 'dark'] as const
export type ColourSchemePreference = (typeof COLOUR_SCHEMES)[number]

export const COLOUR_SCHEME_LABEL: Record<ColourSchemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

export function isColourScheme(value: unknown): value is ColourSchemePreference {
  return COLOUR_SCHEMES.includes(value as ColourSchemePreference)
}

/**
 * The class `<html>` carries for a forced scheme, and nothing for `system`.
 *
 * `globals.css` reads both: `.dark` is the dark palette and Tailwind's `dark:`
 * variant, and `:root:not(.light)` inside the `prefers-color-scheme` block is
 * what lets an explicit "light, please" beat the operating system rather than
 * losing to it. Absence of a class is therefore not a missing case — it is the
 * case where the operating system decides.
 */
export function schemeClass(scheme: ColourSchemePreference): string {
  return scheme === 'system' ? '' : scheme
}

/**
 * What to put in `color-scheme`, so the browser's own furniture matches.
 *
 * `light dark` means "either, follow the media query", which is what `system`
 * wants. A forced scheme names itself, so a reader forcing light on a dark
 * operating system gets light form controls and a light scrollbar rather than
 * the browser's dark ones.
 */
export function colorSchemeProperty(scheme: ColourSchemePreference): string {
  return scheme === 'system' ? 'light dark' : scheme
}
