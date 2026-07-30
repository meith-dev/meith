/**
 * The default theme's token values — the single place colour is decided.
 *
 * `apps/forum/src/styles/globals.css` carries the same values as CSS custom
 * properties so that first paint needs no JS and no database round-trip. This
 * file is the *typed* mirror used for:
 *
 *   - `<meta name="theme-color">`, which needs a real literal, not a var()
 *   - validating `themes.token_overrides` from the database (F26): an override
 *     naming a token that does not exist here is rejected rather than silently
 *     ignored
 *   - the token documentation page in the admin area
 *
 * Keeping both in sync is checked by a test in Phase 2 (theme-kit), which parses
 * globals.css and asserts the key sets match exactly.
 */

/** Every token name the theme layer is allowed to override. */
export const TOKEN_NAMES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
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
  'forum-unread',
  'forum-read',
  'forum-pinned',
  'forum-locked',
  'forum-staff',
  'radius',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]

/**
 * Light-mode defaults. Values are `oklch(...)` strings matching globals.css.
 * Palette discipline (3 neutrals / 1 primary / 2 accents) is documented in
 * globals.css; do not add a seventh colour without updating both.
 */
export const LIGHT_TOKENS: Record<TokenName, string> = {
  background: 'oklch(0.985 0.002 250)',
  foreground: 'oklch(0.205 0.012 255)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.205 0.012 255)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0.205 0.012 255)',
  primary: 'oklch(0.47 0.106 258)',
  'primary-foreground': 'oklch(0.985 0.002 250)',
  secondary: 'oklch(0.955 0.005 250)',
  'secondary-foreground': 'oklch(0.315 0.018 255)',
  muted: 'oklch(0.955 0.005 250)',
  'muted-foreground': 'oklch(0.545 0.016 255)',
  accent: 'oklch(0.945 0.008 250)',
  'accent-foreground': 'oklch(0.315 0.018 255)',
  destructive: 'oklch(0.577 0.213 27)',
  'destructive-foreground': 'oklch(0.985 0.002 250)',
  border: 'oklch(0.912 0.006 252)',
  input: 'oklch(0.912 0.006 252)',
  ring: 'oklch(0.47 0.106 258)',
  'forum-unread': 'oklch(0.47 0.106 258)',
  'forum-read': 'oklch(0.545 0.016 255)',
  'forum-pinned': 'oklch(0.75 0.14 78)',
  'forum-locked': 'oklch(0.577 0.213 27)',
  'forum-staff': 'oklch(0.47 0.106 258)',
  radius: '0.5rem',
}

/** Dark-mode defaults. */
export const DARK_TOKENS: Record<TokenName, string> = {
  background: 'oklch(0.181 0.012 258)',
  foreground: 'oklch(0.955 0.004 250)',
  card: 'oklch(0.225 0.014 258)',
  'card-foreground': 'oklch(0.955 0.004 250)',
  popover: 'oklch(0.225 0.014 258)',
  'popover-foreground': 'oklch(0.955 0.004 250)',
  primary: 'oklch(0.72 0.115 255)',
  'primary-foreground': 'oklch(0.181 0.012 258)',
  secondary: 'oklch(0.272 0.016 258)',
  'secondary-foreground': 'oklch(0.955 0.004 250)',
  muted: 'oklch(0.272 0.016 258)',
  'muted-foreground': 'oklch(0.715 0.014 256)',
  accent: 'oklch(0.305 0.018 258)',
  'accent-foreground': 'oklch(0.955 0.004 250)',
  destructive: 'oklch(0.655 0.19 25)',
  'destructive-foreground': 'oklch(0.181 0.012 258)',
  border: 'oklch(0.305 0.018 258)',
  input: 'oklch(0.305 0.018 258)',
  ring: 'oklch(0.72 0.115 255)',
  'forum-unread': 'oklch(0.72 0.115 255)',
  'forum-read': 'oklch(0.715 0.014 256)',
  'forum-pinned': 'oklch(0.8 0.13 80)',
  'forum-locked': 'oklch(0.655 0.19 25)',
  'forum-staff': 'oklch(0.72 0.115 255)',
  radius: '0.5rem',
}

/**
 * Browser-chrome colours for `<meta name="theme-color">`.
 * These must be plain sRGB hex: Safari and older Chrome ignore oklch() here.
 */
export const BROWSER_THEME_COLOR = {
  light: '#f7f7f8',
  dark: '#1c1e24',
} as const
