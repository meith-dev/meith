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
 * ## The palette is neutral, and that is the point
 *
 * Every greyscale token here is at **chroma zero**. The values that preceded
 * them were the Meith identity — a limewash green ground, a gorse-yellow accent,
 * bog rust for the destructive states — and they were a good palette for one
 * board and a poor default for every other. A default theme is worn by
 * communities that have never heard of us, and a board whose mark is blue should
 * not have to override eleven tokens to stop the walls being green.
 *
 * So the neutrals hold no hue at all, and `primary` is **ink**: near-black in
 * light, near-white in dark. The single loud control on a page — post, reply,
 * search — is the strongest thing on it by contrast rather than by colour, which
 * works on any board. An operator who wants a house colour sets `--primary` and
 * `--primary-foreground` from the control panel, and nothing else in the palette
 * argues with the result. That is what "neutral" is for here: not the absence of
 * a decision, but a decision that leaves the next one open.
 *
 * The semantic tokens keep their hues, because they are not decoration —
 * `thread-locked` is the difference between a thread you can answer and one you
 * cannot. They are held to chroma 0.11–0.17 so they read as information beside
 * somebody's brand rather than competing with it, and every state a hue marks is
 * also a word in the markup: colour is never the only carrier.
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
 * Values here are copied verbatim from `globals.css`, and the test asserts the
 * name sets and the values match exactly. Change a colour in the CSS and the
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

/**
 * Light-mode defaults. Verbatim from `:root` in globals.css.
 *
 * Several tokens deliberately share a value, and the repetition is the
 * statement rather than a copy-paste: `forum-locked`, `thread-locked` and
 * `moderation-rejected` are one signal — *this is closed* — wearing three
 * names, and `forum-read`, `thread-moved` and `group-banned` are one signal
 * too: *this has receded*. They stay separate names because a board that wants
 * to tell a locked thread from a rejected report should be able to, by
 * overriding one of them and not the other.
 */
export const LIGHT_TOKENS: Record<TokenName, string> = {
  background: 'oklch(0.968 0 0)',
  foreground: 'oklch(0.205 0 0)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.205 0 0)',
  primary: 'oklch(0.205 0 0)',
  'primary-foreground': 'oklch(0.985 0 0)',
  secondary: 'oklch(0.94 0 0)',
  'secondary-foreground': 'oklch(0.269 0 0)',
  muted: 'oklch(0.958 0 0)',
  'muted-foreground': 'oklch(0.494 0 0)',
  accent: 'oklch(0.951 0 0)',
  'accent-foreground': 'oklch(0.205 0 0)',
  destructive: 'oklch(0.514 0.183 28.5)',
  'destructive-foreground': 'oklch(0.985 0 0)',
  border: 'oklch(0.905 0 0)',
  input: 'oklch(0.64 0 0)',
  ring: 'oklch(0.556 0 0)',
  radius: '0.375rem',
  'density-unit': '0.25rem',
  'font-mono-stack': 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
  'forum-unread': 'oklch(0.205 0 0)',
  'forum-read': 'oklch(0.556 0 0)',
  'forum-locked': 'oklch(0.554 0.135 32)',
  'thread-pinned': 'oklch(0.55 0.12 68)',
  'thread-locked': 'oklch(0.554 0.135 32)',
  'thread-moved': 'oklch(0.556 0 0)',
  'thread-unapproved': 'oklch(0.545 0.11 88)',
  'thread-deleted': 'oklch(0.487 0.164 26)',
  'post-highlight': 'oklch(0.964 0.036 92)',
  'post-own': 'oklch(0.972 0 0)',
  'post-unapproved': 'oklch(0.956 0.035 84)',
  'moderation-pending': 'oklch(0.55 0.12 68)',
  'moderation-approved': 'oklch(0.518 0.113 150)',
  'moderation-rejected': 'oklch(0.554 0.135 32)',
  'group-admin': 'oklch(0.505 0.169 27)',
  'group-supermod': 'oklch(0.496 0.153 305)',
  'group-mod': 'oklch(0.489 0.127 250)',
  'group-banned': 'oklch(0.556 0 0)',
}

/** Dark-mode defaults. Verbatim from `.dark` in globals.css. */
export const DARK_TOKENS: Record<TokenName, string> = {
  background: 'oklch(0.15 0 0)',
  foreground: 'oklch(0.967 0 0)',
  card: 'oklch(0.196 0 0)',
  'card-foreground': 'oklch(0.967 0 0)',
  primary: 'oklch(0.967 0 0)',
  'primary-foreground': 'oklch(0.196 0 0)',
  secondary: 'oklch(0.256 0 0)',
  'secondary-foreground': 'oklch(0.94 0 0)',
  muted: 'oklch(0.228 0 0)',
  'muted-foreground': 'oklch(0.702 0 0)',
  accent: 'oklch(0.276 0 0)',
  'accent-foreground': 'oklch(0.967 0 0)',
  destructive: 'oklch(0.674 0.174 26)',
  'destructive-foreground': 'oklch(0.18 0 0)',
  border: 'oklch(0.31 0 0)',
  input: 'oklch(0.52 0 0)',
  ring: 'oklch(0.61 0 0)',
  radius: '0.375rem',
  'density-unit': '0.25rem',
  'font-mono-stack': 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
  'forum-unread': 'oklch(0.967 0 0)',
  'forum-read': 'oklch(0.6 0 0)',
  'forum-locked': 'oklch(0.708 0.13 34)',
  'thread-pinned': 'oklch(0.769 0.13 74)',
  'thread-locked': 'oklch(0.708 0.13 34)',
  'thread-moved': 'oklch(0.6 0 0)',
  'thread-unapproved': 'oklch(0.777 0.12 85)',
  'thread-deleted': 'oklch(0.664 0.157 27)',
  'post-highlight': 'oklch(0.276 0.043 92)',
  'post-own': 'oklch(0.221 0 0)',
  'post-unapproved': 'oklch(0.263 0.04 85)',
  'moderation-pending': 'oklch(0.769 0.13 74)',
  'moderation-approved': 'oklch(0.716 0.126 151)',
  'moderation-rejected': 'oklch(0.708 0.13 34)',
  'group-admin': 'oklch(0.687 0.166 27)',
  'group-supermod': 'oklch(0.703 0.144 305)',
  'group-mod': 'oklch(0.694 0.122 250)',
  'group-banned': 'oklch(0.6 0 0)',
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
 * Both are pure greys, which is what makes them safe here: an sRGB round trip
 * cannot drift the hue of a colour that has none.
 */
export const BROWSER_THEME_COLOR = {
  light: '#f4f4f4',
  dark: '#0b0b0b',
} as const
