/**
 * The default theme's token values — the typed mirror of `globals.css`.
 *
 * `apps/forum/src/styles/globals.css` carries the same values as CSS custom
 * properties so that first paint needs no JS and no database round-trip. **That
 * file is the source of truth**: it is what actually paints. This one is the
 * typed mirror, used for:
 *
 *   - `<meta name="theme-color">`, which needs a real literal, not a `var()`
 *   - validating `themes.token_overrides` from the database (F26): an override
 *     naming a token that does not exist here is rejected rather than silently
 *     ignored
 *   - the token documentation page in the admin area
 *
 * ## The sync test is not optional
 *
 * The previous version of this file promised "keeping both in sync is checked by
 * a test in Phase 2". By the time that test was written (F25,
 * `apps/forum/src/styles/tokens.test.ts`) the two had drifted completely: this
 * file named four tokens the CSS does not define (`popover`,
 * `popover-foreground`, `forum-pinned`, `forum-staff`), omitted fifteen it does,
 * and **every single value differed**. Nothing failed, because nothing checked.
 *
 * The consequence was not cosmetic. F26 validates database overrides against
 * `TOKEN_NAMES`, so a board overriding `thread-pinned` would have been told the
 * token does not exist, while an override of `forum-pinned` would have been
 * accepted and then applied to a variable no stylesheet reads.
 *
 * Values here are now copied verbatim from `globals.css`, and the test asserts
 * the name sets and the values match exactly. Change a colour in the CSS and the
 * test names the token you forgot.
 */

/**
 * Every token name the theme layer is allowed to override.
 *
 * The full `:root` custom-property list, in declaration order. Colour tokens
 * carry meaning as well as appearance (`thread-pinned` is not just amber), which
 * is why they are named for the domain and not the palette.
 */
export const TOKEN_NAMES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'radius',
  'density-unit',
  'font-mono-stack',
  'forum-unread',
  'forum-read',
  'forum-locked',
  'thread-pinned',
  'thread-locked',
  'thread-moved',
  'thread-unapproved',
  'thread-deleted',
  'post-highlight',
  'post-own',
  'post-unapproved',
  'moderation-pending',
  'moderation-approved',
  'moderation-rejected',
  'group-admin',
  'group-supermod',
  'group-mod',
  'group-banned',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]

/**
 * Tokens that do not change between light and dark.
 *
 * Geometry and the font stack are not scheme-dependent, so `globals.css` declares
 * them once in `:root` and the `.dark` block does not repeat them. `DARK_TOKENS`
 * carries the same value rather than omitting the key, so the record stays total
 * and no consumer has to handle a hole. The sync test uses this list to know
 * which absences from `.dark` are deliberate.
 */
export const SCHEME_INDEPENDENT_TOKENS = ['radius', 'density-unit', 'font-mono-stack'] as const

/** Light-mode defaults. Verbatim from `:root` in globals.css. */
export const LIGHT_TOKENS: Record<TokenName, string> = {
  background: 'oklch(0.951 0.011 118)',
  foreground: 'oklch(0.228 0.012 145.2)',
  card: 'oklch(0.974 0.008 114.2)',
  'card-foreground': 'oklch(0.228 0.012 145.2)',
  primary: 'oklch(0.424 0.06 139)',
  'primary-foreground': 'oklch(0.967 0.009 119.6)',
  secondary: 'oklch(0.922 0.017 121.8)',
  'secondary-foreground': 'oklch(0.344 0.022 140)',
  muted: 'oklch(0.935 0.014 120.3)',
  'muted-foreground': 'oklch(0.508 0.036 129.3)',
  accent: 'oklch(0.69 0.137 79.4)',
  'accent-foreground': 'oklch(0.225 0.038 84)',
  destructive: 'oklch(0.501 0.139 36.6)',
  'destructive-foreground': 'oklch(0.966 0.008 73.7)',
  border: 'oklch(0.851 0.024 122.8)',
  input: 'oklch(0.851 0.024 122.8)',
  ring: 'oklch(0.424 0.06 139)',
  radius: '0.125rem',
  'density-unit': '0.25rem',
  'font-mono-stack': 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
  'forum-unread': 'oklch(0.424 0.06 139)',
  'forum-read': 'oklch(0.603 0.028 132.3)',
  'forum-locked': 'oklch(0.501 0.139 36.6)',
  'thread-pinned': 'oklch(0.59 0.119 80)',
  'thread-locked': 'oklch(0.501 0.139 36.6)',
  'thread-moved': 'oklch(0.603 0.028 132.3)',
  'thread-unapproved': 'oklch(0.57 0.108 81.9)',
  'thread-deleted': 'oklch(0.457 0.135 35)',
  'post-highlight': 'oklch(0.935 0.05 91)',
  'post-own': 'oklch(0.944 0.018 127.1)',
  'post-unapproved': 'oklch(0.94 0.033 91.7)',
  'moderation-pending': 'oklch(0.614 0.121 82.2)',
  'moderation-approved': 'oklch(0.483 0.09 141.8)',
  'moderation-rejected': 'oklch(0.501 0.139 36.6)',
  'group-admin': 'oklch(0.501 0.139 36.6)',
  'group-supermod': 'oklch(0.479 0.086 333.1)',
  'group-mod': 'oklch(0.457 0.043 230.6)',
  'group-banned': 'oklch(0.603 0.028 132.3)',
}

/** Dark-mode defaults. Verbatim from `.dark` in globals.css. */
export const DARK_TOKENS: Record<TokenName, string> = {
  background: 'oklch(0.217 0.004 106.7)',
  foreground: 'oklch(0.933 0.005 106.5)',
  card: 'oklch(0.247 0.002 106.5)',
  'card-foreground': 'oklch(0.933 0.005 106.5)',
  primary: 'oklch(0.751 0.03 135.6)',
  'primary-foreground': 'oklch(0.206 0.007 135)',
  secondary: 'oklch(0.284 0.004 106.6)',
  'secondary-foreground': 'oklch(0.893 0.007 106.5)',
  muted: 'oklch(0.256 0.002 106.5)',
  'muted-foreground': 'oklch(0.684 0.009 106.6)',
  accent: 'oklch(0.832 0.146 88.5)',
  'accent-foreground': 'oklch(0.194 0.029 89)',
  destructive: 'oklch(0.686 0.137 40.8)',
  'destructive-foreground': 'oklch(0.183 0.014 61.6)',
  border: 'oklch(0.332 0.003 106.6)',
  input: 'oklch(0.359 0.005 106.7)',
  ring: 'oklch(0.751 0.03 135.6)',
  radius: '0.125rem',
  'density-unit': '0.25rem',
  'font-mono-stack': 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
  'forum-unread': 'oklch(0.751 0.03 135.6)',
  'forum-read': 'oklch(0.583 0.009 121.8)',
  'forum-locked': 'oklch(0.715 0.119 45.3)',
  'thread-pinned': 'oklch(0.832 0.146 88.5)',
  'thread-locked': 'oklch(0.715 0.119 45.3)',
  'thread-moved': 'oklch(0.583 0.009 121.8)',
  'thread-unapproved': 'oklch(0.782 0.121 87.3)',
  'thread-deleted': 'oklch(0.701 0.125 39.5)',
  'post-highlight': 'oklch(0.306 0.05 100.7)',
  'post-own': 'oklch(0.267 0.007 106.9)',
  'post-unapproved': 'oklch(0.283 0.039 100)',
  'moderation-pending': 'oklch(0.782 0.121 87.3)',
  'moderation-approved': 'oklch(0.732 0.1 140.4)',
  'moderation-rejected': 'oklch(0.715 0.119 45.3)',
  'group-admin': 'oklch(0.732 0.109 39.4)',
  'group-supermod': 'oklch(0.719 0.076 331.6)',
  'group-mod': 'oklch(0.744 0.046 230.5)',
  'group-banned': 'oklch(0.583 0.009 121.8)',
}

/**
 * Browser-chrome colours for `<meta name="theme-color">`.
 *
 * Plain sRGB hex, because Safari and older Chrome ignore `oklch()` here — which
 * is why this cannot simply reference the token and is the one place a literal
 * colour is correct (guard R7 exempts this file).
 *
 * These are the `background` token converted to sRGB: OKLCH → OKLab → linear
 * sRGB → gamma-encoded. F26's runtime conversion is also used by the exact-match
 * test, so changing `background` cannot leave this browser-chrome pair stale.
 *
 * Limewash and peat: the Meith palette was authored in sRGB and converted *to*
 * OKLCH for the stylesheet, so the round trip lands back on the two hexes it
 * started from rather than drifting a digit.
 */
export const BROWSER_THEME_COLOR = {
  light: '#eef0e8',
  dark: '#1a1a18',
} as const
