/**
 * `midnight` — the second theme's palette (F78).
 *
 * The **names** are the default theme's, exactly, and that is the contract
 * rather than a convenience: `globals.css` maps each one to a Tailwind utility
 * (`--color-background: var(--background)`), so a theme that renamed a token
 * would have utilities pointing at nothing and would render unstyled with no
 * error anywhere. `tokens.test.ts` holds this record against the default's key
 * set for that reason.
 *
 * The **values** are entirely different, which is the point of the feature: if a
 * second theme could only be built by changing core, the theme API is not one.
 *
 * ## How these actually paint
 *
 * `globals.css` carries the *default* theme's values compiled into the
 * stylesheet, so on a board running this theme they are the wrong ones. The app
 * emits the active theme's tokens as a `<style>` block in `<head>`, as the
 * difference from that compiled baseline — see `renderThemeStyle`. Every value
 * below therefore appears in the page rather than in the CSS bundle, and a value
 * that happens to match the default's is not re-declared.
 *
 * ## The look
 *
 * Where the default theme is a light, roomy, card-based board, midnight is a
 * dark, dense, ruled one: near-black backgrounds, a cyan accent that reads as a
 * terminal rather than as a product, square corners (`radius` is 2px, not 6px)
 * and a tighter `density-unit`. Its *light* scheme is not a bright theme — it is
 * a dimmed slate, because a board somebody chose midnight for should not turn
 * white when their laptop switches at sunrise.
 */

/**
 * Every token, in the default theme's declaration order.
 *
 * Not imported from `@forum/theme-default`, deliberately. A theme's palette is
 * its own statement, and taking the list from another theme would mean this file
 * silently gaining a token nobody chose a value for — the sync test is the right
 * place for that coupling, because it fails loudly instead.
 */
export const LIGHT_TOKENS: Record<string, string> = {
  /* "Light" here is dusk: paper the colour of a dimmed screen, not white. */
  background: 'oklch(0.9 0.008 240)',
  foreground: 'oklch(0.24 0.02 240)',
  card: 'oklch(0.945 0.005 240)',
  'card-foreground': 'oklch(0.24 0.02 240)',
  primary: 'oklch(0.48 0.11 210)',
  'primary-foreground': 'oklch(0.97 0.005 240)',
  secondary: 'oklch(0.87 0.012 240)',
  'secondary-foreground': 'oklch(0.28 0.02 240)',
  muted: 'oklch(0.885 0.008 240)',
  'muted-foreground': 'oklch(0.46 0.018 240)',
  accent: 'oklch(0.6 0.13 195)',
  'accent-foreground': 'oklch(0.18 0.03 195)',
  destructive: 'oklch(0.52 0.19 20)',
  'destructive-foreground': 'oklch(0.97 0.005 240)',
  border: 'oklch(0.78 0.012 240)',
  input: 'oklch(0.82 0.012 240)',
  ring: 'oklch(0.6 0.13 195)',
  /* Square, not rounded: the single geometric decision that carries the look. */
  radius: '0.125rem',
  'density-unit': '0.2rem',
  'font-mono-stack': '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace',
  'forum-unread': 'oklch(0.55 0.13 195)',
  'forum-read': 'oklch(0.6 0.012 240)',
  'forum-locked': 'oklch(0.52 0.1 20)',
  'thread-pinned': 'oklch(0.58 0.14 150)',
  'thread-locked': 'oklch(0.52 0.1 20)',
  'thread-moved': 'oklch(0.52 0.02 240)',
  'thread-unapproved': 'oklch(0.58 0.13 85)',
  'thread-deleted': 'oklch(0.52 0.16 20)',
  'post-highlight': 'oklch(0.86 0.05 195)',
  'post-own': 'oklch(0.9 0.02 210)',
  'post-unapproved': 'oklch(0.89 0.04 85)',
  'moderation-pending': 'oklch(0.6 0.13 85)',
  'moderation-approved': 'oklch(0.53 0.13 150)',
  'moderation-rejected': 'oklch(0.52 0.17 20)',
  'group-admin': 'oklch(0.5 0.17 20)',
  'group-supermod': 'oklch(0.5 0.14 310)',
  'group-mod': 'oklch(0.48 0.12 195)',
  'group-banned': 'oklch(0.5 0.02 240)',
}

export const DARK_TOKENS: Record<string, string> = {
  background: 'oklch(0.14 0.012 250)',
  foreground: 'oklch(0.9 0.008 240)',
  card: 'oklch(0.175 0.014 250)',
  'card-foreground': 'oklch(0.9 0.008 240)',
  primary: 'oklch(0.78 0.12 195)',
  'primary-foreground': 'oklch(0.14 0.012 250)',
  secondary: 'oklch(0.22 0.016 250)',
  'secondary-foreground': 'oklch(0.88 0.008 240)',
  muted: 'oklch(0.2 0.014 250)',
  'muted-foreground': 'oklch(0.64 0.014 240)',
  accent: 'oklch(0.8 0.13 195)',
  'accent-foreground': 'oklch(0.14 0.012 250)',
  destructive: 'oklch(0.65 0.19 20)',
  'destructive-foreground': 'oklch(0.13 0.01 250)',
  border: 'oklch(0.27 0.016 250)',
  input: 'oklch(0.3 0.018 250)',
  ring: 'oklch(0.8 0.13 195)',
  radius: '0.125rem',
  'density-unit': '0.2rem',
  'font-mono-stack': '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace',
  'forum-unread': 'oklch(0.8 0.13 195)',
  'forum-read': 'oklch(0.44 0.014 250)',
  'forum-locked': 'oklch(0.62 0.12 20)',
  'thread-pinned': 'oklch(0.72 0.14 150)',
  'thread-locked': 'oklch(0.62 0.12 20)',
  'thread-moved': 'oklch(0.56 0.016 250)',
  'thread-unapproved': 'oklch(0.76 0.14 90)',
  'thread-deleted': 'oklch(0.64 0.16 20)',
  'post-highlight': 'oklch(0.26 0.05 195)',
  'post-own': 'oklch(0.19 0.02 210)',
  'post-unapproved': 'oklch(0.25 0.045 85)',
  'moderation-pending': 'oklch(0.72 0.15 90)',
  'moderation-approved': 'oklch(0.7 0.13 150)',
  'moderation-rejected': 'oklch(0.65 0.17 20)',
  'group-admin': 'oklch(0.68 0.17 20)',
  'group-supermod': 'oklch(0.7 0.13 310)',
  'group-mod': 'oklch(0.78 0.12 195)',
  'group-banned': 'oklch(0.5 0.016 250)',
}

/**
 * Browser-chrome colours for `<meta name="theme-color">`.
 *
 * sRGB hex, because Safari and older Chrome ignore `oklch()` in this meta tag —
 * the same exemption the default theme's file documents. These are the two
 * `background` values converted, and F26's runtime conversion is what checks
 * them, so changing a background cannot leave this pair stale.
 */
export const BROWSER_THEME_COLOR = {
  light: '#d9dfe3',
  dark: '#060a0e',
} as const
