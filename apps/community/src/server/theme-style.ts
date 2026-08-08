/**
 * F26 — validate database token overrides and render the final CSS cascade.
 *
 * ## What changed when members were given a theme switcher
 *
 * Two things this file used to assume stopped being true.
 *
 * **An override is per colour scheme.** A stored override used to be a flat
 * `{ token: value }` map applied to light *and* dark alike, which is fine for
 * `radius` and wrong for every colour on the list: a board that set
 * `background` to white got white in dark mode too, and the only way to avoid
 * it was to not use the editor. Overrides are now `{ light: {…}, dark: {…} }`.
 * The flat shape is still read — it is what every existing row holds — and
 * means "both schemes", which is exactly what it did before.
 *
 * **A page carries more than one theme's palette.** `renderBoardStyle` emits
 * the board's default theme unscoped, as before, and every *other* enabled
 * theme under `[data-theme="<key>"]`. A pre-paint script sets that attribute
 * from the member's stored choice, so switching costs no request, no cookie and
 * no dynamic render — and a board with one enabled theme emits byte-for-byte
 * what it emitted before, because the scoped section is skipped entirely.
 *
 * What a scoped block contains is the **difference from the default theme's
 * effective values**, not from the compiled stylesheet. That is the property
 * that makes switching correct rather than approximately correct: the unscoped
 * block is still in force when `data-theme` names another theme, so anything
 * the two themes disagree about must be restated, and anything they agree about
 * must not be.
 */

import { colourToHex } from '@/view/oklch'

export interface ThemeTokens {
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

export interface ThemeRuntimeStyle {
  readonly css: string
  readonly browserThemeColor: { readonly light: string; readonly dark: string }
}

/** A stored customisation, resolved per colour scheme. */
export interface TokenOverrides {
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

/** One enabled theme, as `renderBoardStyle` needs it. */
export interface BoardTheme {
  readonly key: string
  readonly tokens: ThemeTokens
  /** Straight from the database. Validated here, not by the caller. */
  readonly overrides: unknown
  readonly customCss: string | null
}

export type ColourScheme = 'light' | 'dark'

export const COLOUR_SCHEMES: readonly ColourScheme[] = ['light', 'dark']

const MAX_CUSTOM_CSS_LENGTH = 100_000

/**
 * What may appear inside `[data-theme="…"]`.
 *
 * Theme keys come from `community.config.ts` and are therefore developer-written
 * identifiers rather than input — but they reach a selector in a `<style>`
 * block, and "it cannot be hostile because of where it came from" is the
 * argument every injection is written under. Checked here so the claim is a
 * line of code rather than a habit.
 */
const THEME_KEY = /^[a-z0-9][a-z0-9_-]*$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * CSS values only: never let a stored value smuggle a second declaration or
 * markup into the style block it is about to be written into.
 *
 * Exported because tokens are no longer the only thing that reaches a
 * `<style>` from a database column — a usergroup's name colour does too, from a
 * different table, through a different screen. One check, so the two cannot
 * drift into disagreeing about what a safe CSS value is.
 */
export function assertSafeCssValue(name: string, value: string): void {
  if (
    value.length === 0 ||
    value.length > 256 ||
    /[;{}<>]/.test(value) ||
    !/^[a-zA-Z0-9#%(),.\s'"/+*=-]+$/.test(value)
  ) {
    throw new Error(`Theme ${name} has an unsafe CSS value.`)
  }
}

function assertSafeThemeKey(key: string): void {
  if (!THEME_KEY.test(key)) {
    throw new Error(`Theme key "${key}" cannot be used in a stylesheet selector.`)
  }
}

/**
 * Is this raw value the per-scheme shape, or the flat one every row written
 * before the switcher holds?
 *
 * Decided on the keys rather than on a version field, because there is no
 * version field to add to rows that are already written. It is unambiguous:
 * `light` and `dark` are not token names — `TOKEN_NAMES` has neither — so an
 * object whose keys are exactly those, with object values, cannot be a flat
 * override map. An empty object is read as the new shape, which is the same
 * answer either way.
 */
function isSchemeShaped(raw: Record<string, unknown>): boolean {
  const keys = Object.keys(raw)
  return (
    keys.every((key) => key === 'light' || key === 'dark') &&
    keys.every((key) => isRecord(raw[key]))
  )
}

function validateScheme(
  tokens: ThemeTokens,
  raw: Record<string, unknown>,
): Record<string, string> {
  const overrides: Record<string, string> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (!(name in tokens.light) || !(name in tokens.dark)) {
      throw new Error(`Theme token "${name}" is not declared by this theme.`)
    }
    if (typeof value !== 'string') {
      throw new Error(`Theme token "${name}" must have a string value.`)
    }
    assertSafeCssValue(`token "${name}"`, value)
    if (name === 'background' && colorToHex(value) === null) {
      throw new Error('Theme token "background" must be an sRGB hex or OKLCH colour.')
    }
    overrides[name] = value
  }
  return overrides
}

/**
 * Validates raw JSON at the database boundary. The admin actions reuse this
 * before saving, while validating here keeps a hand-edited or old database row
 * from injecting a style block into a request.
 */
export function validateTokenOverrides(tokens: ThemeTokens, raw: unknown): TokenOverrides {
  if (raw === undefined || raw === null) return { light: {}, dark: {} }
  if (!isRecord(raw)) throw new Error('Theme token overrides must be an object.')

  if (isSchemeShaped(raw)) {
    return {
      light: validateScheme(tokens, isRecord(raw.light) ? raw.light : {}),
      dark: validateScheme(tokens, isRecord(raw.dark) ? raw.dark : {}),
    }
  }

  /* The pre-switcher shape: one value, both schemes. */
  const both = validateScheme(tokens, raw)
  return { light: both, dark: { ...both } }
}

/** Reject stylesheet escapes and network fetches; regular CSS remains CSS. */
export function validateCustomCss(value: string | null): string | null {
  if (value === null || value.trim() === '') return null
  if (
    value.length > MAX_CUSTOM_CSS_LENGTH ||
    /<\/style|@import|url\s*\(|expression\s*\(/i.test(value)
  ) {
    throw new Error('Theme custom CSS contains an unsafe construct.')
  }
  return value
}

/**
 * Any colour this board accepts, as sRGB hex.
 *
 * The arithmetic moved to `@/view/oklch` when the theme editor grew a real
 * OKLCH picker: the same conversions are needed in the browser, and two copies
 * of a colour-space matrix is two chances to transpose a coefficient. This name
 * stays because it is what the render path and its tests have always called.
 */
export const colorToHex = colourToHex

function declarations(values: Readonly<Record<string, string>>): string {
  return Object.entries(values)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')
}

/**
 * A theme's values with the board's overrides applied — what the board actually
 * paints for that theme, before anything is compared with anything.
 *
 * Every difference this file emits is a difference between two of these, which
 * is the whole reason it exists as a named step: comparing a theme's shipped
 * values against another theme's *effective* ones is the bug that leaks one
 * theme's brand colour into another theme's palette, and it is invisible in a
 * diff unless the two sides have names.
 */
function effectiveTokens(theme: BoardTheme): ThemeTokens {
  const overrides = validateTokenOverrides(theme.tokens, theme.overrides)
  return {
    light: { ...theme.tokens.light, ...overrides.light },
    dark: { ...theme.tokens.dark, ...overrides.dark },
  }
}

/**
 * The declarations needed to get from `against` to `values`.
 *
 * Emitted as a diff, not as a whole palette, for the reason F78 gave and one
 * more the switcher added: a board on one theme emits nothing at all, so the
 * common case costs zero bytes on every page; a token this theme did not change
 * is left to the stylesheet, where a future edit to the compiled default still
 * reaches it; and a second theme's scoped block carries only what it actually
 * disagrees with, which on a palette-only theme is a handful of lines.
 */
function differing(
  values: Readonly<Record<string, string>>,
  against: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    if (against[name] !== value) {
      assertSafeCssValue(`token "${name}"`, value)
      out[name] = value
    }
  }
  return out
}

/**
 * Restate, in the dark block, every token the light block declares.
 *
 * ## The bug this fixes, which was invisible in the emitted CSS
 *
 * A light-only override — the exact thing this file grew per-scheme overrides
 * *for* — used to emit `:root{--primary:…}` and no dark block at all, on the
 * reasoning that the theme's dark value equals the baseline and the baseline is
 * already in the stylesheet. It is, in `globals.css`'s `.dark` rule, and that
 * rule loses: `:root` and `.dark` are both one class's worth of specificity, and
 * this block is injected *after* the stylesheet, so at equal specificity the
 * later rule wins. A board that set a light-mode brand colour got it in dark
 * mode too, which is precisely the failure the scheme-keyed shape was introduced
 * to end.
 *
 * The asymmetry is real rather than an oversight in the fix: a **dark**-only
 * override needs no restatement in light, because the dark block is scoped to
 * `.dark` and to `prefers-color-scheme: dark`, and neither is in force when the
 * reader is in light mode. Only light travels, because only light is unscoped.
 *
 * The value restated is the theme's **effective** dark value, so a token
 * overridden in both schemes keeps its dark override rather than being rewritten
 * with the theme's own.
 */
function restatedForDark(
  light: Readonly<Record<string, string>>,
  dark: Record<string, string>,
  darkValues: Readonly<Record<string, string>>,
): Record<string, string> {
  const out = { ...dark }

  for (const name of Object.keys(light)) {
    if (name in out) continue
    const value = darkValues[name]
    /* A theme that does not declare it has nothing to restate. */
    if (value === undefined) continue
    assertSafeCssValue(`token "${name}"`, value)
    out[name] = value
  }

  return out
}

/**
 * A light block and a dark block, written so both win however the reader's
 * browser decides which scheme it is in.
 *
 * The `@media` repeat is not redundancy: `.dark` is a class this board's own
 * script sets, and a reader who has never touched the switcher has no class at
 * all — they are in dark mode because their operating system says so. The
 * `:not(.light)` is what lets an explicit "light, please" beat the operating
 * system rather than losing to it.
 */
function schemeBlocks(
  light: Record<string, string>,
  dark: Record<string, string>,
  selector: { light: string; dark: string; media: string },
): string {
  const lightCss = declarations(light)
  const darkCss = declarations(dark)

  return (
    (lightCss === '' ? '' : `${selector.light}{${lightCss}}`) +
    (darkCss === ''
      ? ''
      : `${selector.dark}{${darkCss}}` +
        `@media (prefers-color-scheme: dark){${selector.media}{${darkCss}}}`)
  )
}

/**
 * Render every enabled theme's palette into one style block.
 *
 * @param defaultKey - the theme a visitor who has chosen nothing sees. Its
 * values go in unscoped, so first paint needs no script to have run.
 * @param baseline - the token values the compiled stylesheet already carries
 * (`globals.css`, held to the default *package's* values by `tokens.test.ts`).
 * Anything equal to it is not re-declared.
 */
export function renderBoardStyle(input: {
  readonly themes: readonly BoardTheme[]
  readonly defaultKey: string
  readonly baseline: ThemeTokens
}): ThemeRuntimeStyle {
  const active = input.themes.find((theme) => theme.key === input.defaultKey)
  if (active === undefined) {
    throw new Error(`Theme "${input.defaultKey}" is not among the enabled themes.`)
  }

  const activeTokens = effectiveTokens(active)

  /*
   * Order is the cascade, and it is the whole correctness argument. The board
   * default's values come first, then its custom CSS, then the alternates —
   * each of which is scoped to an attribute the default never carries, so a
   * later block can only win when the reader has actually chosen that theme.
   */
  const activeLight = differing(activeTokens.light, input.baseline.light)

  let css = schemeBlocks(
    activeLight,
    restatedForDark(
      activeLight,
      differing(activeTokens.dark, input.baseline.dark),
      activeTokens.dark,
    ),
    { light: ':root', dark: '.dark', media: ':root:not(.light)' },
  )
  css += validateCustomCss(active.customCss) ?? ''

  for (const theme of input.themes) {
    if (theme.key === active.key) continue
    assertSafeThemeKey(theme.key)

    const tokens = effectiveTokens(theme)
    const scope = `[data-theme="${theme.key}"]`
    const light = differing(tokens.light, activeTokens.light)

    css += schemeBlocks(
      light,
      /*
       * Same rule, one specificity up. `:root[data-theme="x"]` outranks both
       * the stylesheet's `.dark` and the board default's, so a token this theme
       * disagrees about in light only would paint its light value on a reader
       * in dark mode.
       */
      restatedForDark(light, differing(tokens.dark, activeTokens.dark), tokens.dark),
      {
        light: `:root${scope}`,
        dark: `.dark${scope}`,
        media: `:root${scope}:not(.light)`,
      },
    )

    /*
     * An alternate theme's custom CSS is *nested* under its selector rather
     * than emitted flat, because it must stop applying the moment a reader
     * picks a different theme — and the rules inside it are arbitrary author
     * CSS whose selectors this file has no business rewriting.
     *
     * Native CSS nesting does exactly the right thing here: every rule inside
     * becomes a descendant of `:root`, which every element on the page already
     * is. The one construct it changes the meaning of is a rule that targets
     * `:root` itself, and the admin screen says so beside the box.
     */
    const custom = validateCustomCss(theme.customCss)
    if (custom !== null) css += `:root${scope}{${custom}}`
  }

  const light = colorToHex(activeTokens.light.background ?? '')
  const dark = colorToHex(activeTokens.dark.background ?? '')
  if (light === null || dark === null) {
    throw new Error('Theme background tokens must be sRGB hex or OKLCH colours.')
  }

  return { css, browserThemeColor: { light, dark } }
}

/**
 * One theme, rendered on its own.
 *
 * Kept because two callers genuinely have one theme and no board: the admin
 * preview, which is showing what a save *would* do, and the fixture data source,
 * which has no `themes` table to read. Both would have to invent a board to call
 * `renderBoardStyle`, and inventing one is how a preview stops previewing the
 * thing it claims to.
 *
 * @param baseline - defaults to `tokens` itself, which means "the stylesheet is
 * this theme's" and emits no defaults.
 */
export function renderThemeStyle(
  tokens: ThemeTokens,
  rawOverrides: unknown,
  customCss: string | null,
  baseline: ThemeTokens = tokens,
): ThemeRuntimeStyle {
  return renderBoardStyle({
    themes: [{ key: 'default', tokens, overrides: rawOverrides, customCss }],
    defaultKey: 'default',
    baseline,
  })
}

/* ------------------------------------------------------------------ *
 * Usergroup name colours
 * ------------------------------------------------------------------ */

/** One usergroup's colours, as `renderGroupNameStyle` needs them. */
export interface GroupNameColour {
  readonly groupId: number
  /** Straight from the database, like a token override. Validated here. */
  readonly light: string | null
  readonly dark: string | null
}

/** The class every username of this group carries. */
export function groupNameClass(groupId: number): string {
  return `gname-${groupId}`
}

/**
 * Render the board's usergroup colours into one style block.
 *
 * ## Why this is CSS and not a value on the model
 *
 * Because the answer differs between light and dark, and a `style` attribute
 * cannot hold two of them. The reader who makes this necessary is the commonest
 * one: somebody on "system", whose page carries no `.dark` class at all because
 * their dark mode is a media query. The only place both values can live is the
 * stylesheet, in the same three blocks `renderBoardStyle` uses and for exactly
 * the same reason — `.dark` is the class this board's own control sets,
 * `:root:not(.light)` is what lets an explicit "light, please" beat the
 * operating system.
 *
 * ## Why the class name is written twice
 *
 * `.gname-3.gname-3` is specificity 0-2-0, and that is deliberate. A theme puts
 * its own colour on a username with a utility class — one class, 0-1-0 — and at
 * equal specificity the later rule in the stylesheet wins. Which of these two
 * `<style>` elements the framework emits later is not something this board
 * controls, so an unrepeated selector would win on some builds and lose on
 * others. Eight characters buys the question away.
 *
 * Values are validated rather than trusted. They arrive from a column an
 * operator can edit with SQL and a restored backup carries in from another
 * board, and they are about to be written into a `<style>` block.
 */
export function renderGroupNameStyle(groups: readonly GroupNameColour[]): string {
  if (groups.length === 0) return ''

  /*
   * Built selector-first rather than by rewriting generated CSS. An earlier
   * draft produced the light rules and regex-replaced their selectors to make
   * the dark ones, which works until a colour value happens to contain the
   * pattern — and is unreadable long before that.
   */
  const block = (pick: (group: GroupNameColour) => string | null, prefix: string): string =>
    groups
      .map((group) => {
        const colour = pick(group)
        if (colour === null) return ''
        assertSafeCssValue(`group ${group.groupId} colour`, colour)
        const selector = `.${groupNameClass(group.groupId)}`
        return `${prefix}${selector}${selector}{color:${colour};}`
      })
      .join('')

  const dark = block((group) => group.dark, '.dark ')

  return (
    block((group) => group.light, '') +
    dark +
    /*
     * Omitted entirely when no group has a dark colour, rather than emitted
     * empty: a board that has only ever set light colours should ship no media
     * query at all.
     */
    (dark === ''
      ? ''
      : `@media (prefers-color-scheme: dark){${block((group) => group.dark, ':root:not(.light) ')}}`)
  )
}
