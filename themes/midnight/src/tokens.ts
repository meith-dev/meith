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
 * Where the default theme is a light, roomy, ruled board, midnight is a dark,
 * dense one: near-black backgrounds, a cyan accent that reads as a terminal
 * rather than as a product, no corner rounding at all and a tighter
 * `density-unit`. Its *light* scheme is not a bright theme — it is a dimmed
 * slate, because a board somebody chose midnight for should not turn white when
 * their laptop switches at sunrise.
 *
 * **`radius` is `0rem`, and it moved.** It used to be 2px against the default's
 * 6px, and that was the whole geometric distinction until the default adopted
 * the Meith identity and came down to 2px itself — at which point midnight's
 * stated difference silently stopped being one. `theme.test.ts` caught it,
 * which is the coupling that file exists for. Fully square is also the more
 * honest reading of "terminal, not product": the previous 2px was a compromise
 * with a rounder default that no longer exists.
 */

/**
 * Every token, in the default theme's declaration order.
 *
 * Not imported from `@meith/theme-default`, deliberately. A theme's palette is
 * its own statement, and taking the list from another theme would mean this file
 * silently gaining a token nobody chose a value for — the sync test is the right
 * place for that coupling, because it fails loudly instead.
 */
export const LIGHT_TOKENS: Record<string, string> = {
  /* "Light" here is dusk: paper the colour of a dimmed screen, not white. */
  background: 'oklch(0.9 0.008 240)',
  foreground: 'oklch(0.24 0.02 240)',
  /*
   * This theme's stack runs the other way. The default's page is darker than its
   * panels — paper on a desk — and midnight's panels are *lighter* than its page
   * in both schemes, because a terminal is a lit region on an unlit ground. So
   * `surface` sits between the two here as it does there, and the direction it
   * travels is opposite.
   */
  surface: 'oklch(0.92 0.008 240)',
  card: 'oklch(0.945 0.005 240)',
  'card-foreground': 'oklch(0.24 0.02 240)',
  primary: 'oklch(0.48 0.11 210)',
  'primary-foreground': 'oklch(0.97 0.005 240)',
  'primary-hover': 'oklch(0.41 0.1 210)',
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
  /*
   * Declared, and then not drawn — see `elevation` below. A theme has to name
   * every token the default names, and a board that turns the shadow back on
   * should get a colour somebody chose rather than the default theme's warm
   * grey over this theme's blue-grey panels.
   */
  'shadow-tint': 'oklch(0.24 0.02 240 / 10%)',
  /* Square, not rounded: the single geometric decision that carries the look. */
  radius: '0rem',
  'density-unit': '0.2rem',
  'font-mono-stack': '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace',
  'font-sans-stack': '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  'font-heading-stack': 'var(--font-sans-stack)',
  /*
   * No shadows at all, which is the same decision `radius: 0rem` is. A terminal
   * is flat: regions are separated by rules and by colour, never by pretending
   * one sheet of paper is above another. This is the token that lets a theme say
   * that in one word instead of overriding every panel.
   */
  elevation: 'none',
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
  surface: 'oklch(0.157 0.013 250)',
  card: 'oklch(0.175 0.014 250)',
  'card-foreground': 'oklch(0.9 0.008 240)',
  primary: 'oklch(0.78 0.12 195)',
  'primary-foreground': 'oklch(0.14 0.012 250)',
  'primary-hover': 'oklch(0.85 0.11 195)',
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
  'shadow-tint': 'oklch(0 0 0 / 50%)',
  radius: '0rem',
  'density-unit': '0.2rem',
  'font-mono-stack': '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace',
  'font-sans-stack': '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  'font-heading-stack': 'var(--font-sans-stack)',
  elevation: 'none',
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
