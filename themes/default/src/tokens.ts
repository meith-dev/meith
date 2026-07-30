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
  background: 'oklch(0.976 0.002 265)',
  foreground: 'oklch(0.21 0.015 265)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.21 0.015 265)',
  primary: 'oklch(0.45 0.11 264)',
  'primary-foreground': 'oklch(0.99 0.002 265)',
  secondary: 'oklch(0.94 0.006 265)',
  'secondary-foreground': 'oklch(0.3 0.02 265)',
  muted: 'oklch(0.955 0.004 265)',
  'muted-foreground': 'oklch(0.53 0.017 265)',
  accent: 'oklch(0.72 0.15 68)',
  'accent-foreground': 'oklch(0.24 0.03 68)',
  destructive: 'oklch(0.55 0.2 27)',
  'destructive-foreground': 'oklch(0.99 0.002 265)',
  border: 'oklch(0.9 0.006 265)',
  input: 'oklch(0.9 0.006 265)',
  ring: 'oklch(0.45 0.11 264)',
  radius: '0.375rem',
  'density-unit': '0.25rem',
  'font-mono-stack': 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
  'forum-unread': 'oklch(0.45 0.11 264)',
  'forum-read': 'oklch(0.62 0.012 265)',
  'forum-locked': 'oklch(0.55 0.09 27)',
  'thread-pinned': 'oklch(0.62 0.14 68)',
  'thread-locked': 'oklch(0.55 0.09 27)',
  'thread-moved': 'oklch(0.55 0.02 265)',
  'thread-unapproved': 'oklch(0.62 0.13 85)',
  'thread-deleted': 'oklch(0.55 0.16 27)',
  'post-highlight': 'oklch(0.95 0.05 68)',
  'post-own': 'oklch(0.97 0.014 264)',
  'post-unapproved': 'oklch(0.96 0.04 85)',
  'moderation-pending': 'oklch(0.65 0.14 85)',
  'moderation-approved': 'oklch(0.55 0.13 150)',
  'moderation-rejected': 'oklch(0.55 0.18 27)',
  'group-admin': 'oklch(0.5 0.18 27)',
  'group-supermod': 'oklch(0.5 0.14 300)',
  'group-mod': 'oklch(0.47 0.12 220)',
  'group-banned': 'oklch(0.55 0.02 265)',
}

/** Dark-mode defaults. Verbatim from `.dark` in globals.css. */
export const DARK_TOKENS: Record<TokenName, string> = {
  background: 'oklch(0.19 0.008 265)',
  foreground: 'oklch(0.94 0.004 265)',
  card: 'oklch(0.235 0.01 265)',
  'card-foreground': 'oklch(0.94 0.004 265)',
  primary: 'oklch(0.72 0.1 264)',
  'primary-foreground': 'oklch(0.18 0.015 265)',
  secondary: 'oklch(0.29 0.012 265)',
  'secondary-foreground': 'oklch(0.92 0.004 265)',
  muted: 'oklch(0.27 0.01 265)',
  'muted-foreground': 'oklch(0.69 0.012 265)',
  accent: 'oklch(0.76 0.14 68)',
  'accent-foreground': 'oklch(0.2 0.02 68)',
  destructive: 'oklch(0.65 0.18 27)',
  'destructive-foreground': 'oklch(0.16 0.01 265)',
  border: 'oklch(0.32 0.012 265)',
  input: 'oklch(0.34 0.014 265)',
  ring: 'oklch(0.72 0.1 264)',
  radius: '0.375rem',
  'density-unit': '0.25rem',
  'font-mono-stack': 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
  'forum-unread': 'oklch(0.75 0.11 264)',
  'forum-read': 'oklch(0.5 0.012 265)',
  'forum-locked': 'oklch(0.62 0.11 27)',
  'thread-pinned': 'oklch(0.76 0.14 68)',
  'thread-locked': 'oklch(0.62 0.11 27)',
  'thread-moved': 'oklch(0.6 0.015 265)',
  'thread-unapproved': 'oklch(0.74 0.13 85)',
  'thread-deleted': 'oklch(0.64 0.16 27)',
  'post-highlight': 'oklch(0.3 0.05 68)',
  'post-own': 'oklch(0.25 0.02 264)',
  'post-unapproved': 'oklch(0.29 0.045 85)',
  'moderation-pending': 'oklch(0.74 0.13 85)',
  'moderation-approved': 'oklch(0.68 0.13 150)',
  'moderation-rejected': 'oklch(0.65 0.17 27)',
  'group-admin': 'oklch(0.68 0.17 27)',
  'group-supermod': 'oklch(0.68 0.13 300)',
  'group-mod': 'oklch(0.68 0.11 220)',
  'group-banned': 'oklch(0.55 0.015 265)',
}

/**
 * Browser-chrome colours for `<meta name="theme-color">`.
 *
 * Plain sRGB hex, because Safari and older Chrome ignore `oklch()` here — which
 * is why this cannot simply reference the token and is the one place a literal
 * colour is correct (guard R7 exempts this file).
 *
 * These are the `background` token converted to sRGB: OKLCH → OKLab → linear
 * sRGB → gamma-encoded. They were previously `#f7f7f8`/`#1c1e24`, which matched
 * an older palette and no longer matched anything. **Nothing checks this pair
 * against the tokens** — an exact assertion needs the colour conversion in code,
 * which belongs with F26's override pipeline (it has to convert an overridden
 * background too). Until then, changing `background` means recomputing these by
 * hand, and the test only checks the format.
 */
export const BROWSER_THEME_COLOR = {
  light: '#f6f7f8',
  dark: '#121417',
} as const
