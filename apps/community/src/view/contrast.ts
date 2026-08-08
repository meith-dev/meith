/**
 * Whether a palette can be read.
 *
 * ## Why the editor needs this and a preview does not answer it
 *
 * The theme editor's sample shows an operator what their colours look like, and
 * looking is exactly the sense that cannot answer the question being asked. The
 * person choosing the colour is looking at a bright screen in a lit room with
 * whatever vision they have; the member who cannot read the result is somewhere
 * else, and is not in the conversation. "It looks fine to me" has ruined more
 * boards than a bad hue ever has.
 *
 * So the screen measures. Every pair below is a foreground the board actually
 * puts on that background — not a matrix of every colour against every other,
 * which would be forty failures nobody can act on. Each one is a sentence an
 * operator can check against their own page: *the label on a primary button*,
 * *a timestamp in a community row*, *a locked thread's title*.
 *
 * ## The pairs are the claim, and a test holds the shipped themes to them
 *
 * `contrast.test.ts` asserts that **every registered theme passes every pair in
 * both schemes**. That is what makes a failure on this screen mean something: if
 * the board shipped with two amber-on-white pairs already failing, an operator
 * would learn within a day to ignore the panel, and the one failure they caused
 * themselves would scroll past with the rest. A default that passes is the only
 * version of this feature worth building.
 *
 * It also means the check runs in both directions. A pair added here that the
 * default theme fails is either a wrong pair or a real bug in the palette, and
 * the test makes somebody decide which — rather than the pair being quietly
 * dropped because the panel looked untidy.
 *
 * ## Unreadable is reported, unreadable-to-this-code is not
 *
 * A token may hold `color-mix(…)`, a `var()` reference or an OKLCH colour with
 * an alpha channel — all legitimate CSS, none of them something this module can
 * turn into two luminances. Those come back as `unknown` rather than as a pass,
 * because a check that silently reports success for the values it could not read
 * is worse than no check: it is a green tick over an unanswered question.
 */

import { oklchToRgb, parseColour, relativeLuminance } from './oklch'

/**
 * What a pair is for, which is what decides the ratio it owes.
 *
 * WCAG 2.2 asks 4.5:1 of body text, 3:1 of text at 24px or 19px bold, and 3:1 of
 * a control's own boundary — the focus ring and a field's edge, which carry
 * information without being text. Three needs rather than one number so the
 * screen can say *why* a threshold is what it is.
 */
export type ContrastNeed = 'text' | 'large-text' | 'non-text'

export const REQUIRED_RATIO: Readonly<Record<ContrastNeed, number>> = {
  text: 4.5,
  'large-text': 3,
  'non-text': 3,
}

export interface ContrastPair {
  /** The token drawn on top: text, an outline, a mark. */
  readonly foreground: string
  /** The token it is drawn on. */
  readonly background: string
  /** Where a reader of the board would see this pair, in their words. */
  readonly label: string
  readonly need: ContrastNeed
}

/**
 * Every foreground the board puts on a background, once each.
 *
 * Deliberately not exhaustive. `muted-foreground` on `muted` is a combination
 * the markup can produce, but the pairs that carry the board's meaning are the
 * ones listed — and a panel of sixty rows is a panel nobody reads. The rule for
 * adding one: a *named* place on the board where those two tokens meet.
 *
 * The semantic colours are all checked against `card`, because a community row, a
 * thread row and a post header are panels. On the page background they are a
 * shade more contrasty in light and a shade less in dark, and a second entry for
 * each would double the panel to say the same thing.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'foreground', background: 'background', label: 'Body text on the page', need: 'text' },
  { foreground: 'foreground', background: 'surface', label: 'Text on a band — the header, a table heading', need: 'text' },
  { foreground: 'card-foreground', background: 'card', label: 'Text in a panel — a post, a community row', need: 'text' },
  { foreground: 'muted-foreground', background: 'card', label: 'Timestamps and counts in a panel', need: 'text' },
  { foreground: 'muted-foreground', background: 'background', label: 'Timestamps and counts on the page', need: 'text' },
  { foreground: 'primary-foreground', background: 'primary', label: 'The label on a primary button', need: 'text' },
  { foreground: 'primary-foreground', background: 'primary-hover', label: 'The label on a hovered primary button', need: 'text' },
  { foreground: 'secondary-foreground', background: 'secondary', label: 'The label on a secondary button', need: 'text' },
  { foreground: 'destructive-foreground', background: 'destructive', label: 'The label on “Delete”', need: 'text' },
  { foreground: 'accent-foreground', background: 'accent', label: 'Text on a hovered row or menu item', need: 'text' },

  { foreground: 'card-foreground', background: 'post-highlight', label: 'A linked-to post’s text', need: 'text' },
  { foreground: 'card-foreground', background: 'post-own', label: 'Your own post’s text', need: 'text' },
  { foreground: 'card-foreground', background: 'post-unapproved', label: 'A held post’s text', need: 'text' },

  { foreground: 'community-unread', background: 'card', label: 'A community with new posts, in its row', need: 'text' },
  { foreground: 'community-read', background: 'card', label: 'A community with nothing new', need: 'text' },
  { foreground: 'community-locked', background: 'card', label: 'A closed community', need: 'text' },
  { foreground: 'thread-pinned', background: 'card', label: 'A pinned thread’s title', need: 'text' },
  { foreground: 'thread-locked', background: 'card', label: 'A locked thread’s title', need: 'text' },
  { foreground: 'thread-moved', background: 'card', label: 'A moved thread’s stub', need: 'text' },
  { foreground: 'thread-unapproved', background: 'card', label: 'A thread awaiting approval', need: 'text' },
  { foreground: 'thread-deleted', background: 'card', label: 'A deleted thread, to staff', need: 'text' },

  { foreground: 'moderation-pending', background: 'card', label: 'A report waiting for a decision', need: 'text' },
  { foreground: 'moderation-approved', background: 'card', label: 'An approved report', need: 'text' },
  { foreground: 'moderation-rejected', background: 'card', label: 'A rejected report', need: 'text' },

  { foreground: 'group-admin', background: 'card', label: 'An administrator’s name beside a post', need: 'text' },
  { foreground: 'group-supermod', background: 'card', label: 'A super moderator’s name', need: 'text' },
  { foreground: 'group-mod', background: 'card', label: 'A moderator’s name', need: 'text' },
  { foreground: 'group-banned', background: 'card', label: 'A banned member’s name', need: 'text' },

  /*
   * The three that are not text. A focus ring nobody can see is a board that
   * cannot be used from a keyboard, and it is checked against both surfaces
   * because focus lands on controls in panels and controls on the page alike.
   */
  { foreground: 'ring', background: 'background', label: 'The focus outline on the page', need: 'non-text' },
  { foreground: 'ring', background: 'card', label: 'The focus outline in a panel', need: 'non-text' },
  { foreground: 'input', background: 'card', label: 'A field’s edge in a panel', need: 'non-text' },
]

export type ContrastState = 'pass' | 'fail' | 'unknown'

export interface ContrastCheck {
  readonly pair: ContrastPair
  readonly required: number
  /** `null` when either value is not a colour this board can measure. */
  readonly ratio: number | null
  readonly state: ContrastState
}

/**
 * The WCAG ratio between two colours, or `null` if either cannot be read.
 *
 * Order does not matter — the formula puts the lighter of the two on top — which
 * is why the pair's *labels* carry the direction instead. Two tokens that fail
 * fail whichever is in front.
 */
export function contrastRatio(a: string, b: string): number | null {
  const first = parseColour(a)
  const second = parseColour(b)
  if (first === null || second === null) return null

  const lighter = Math.max(
    relativeLuminance(oklchToRgb(first).rgb),
    relativeLuminance(oklchToRgb(second).rgb),
  )
  const darker = Math.min(
    relativeLuminance(oklchToRgb(first).rgb),
    relativeLuminance(oklchToRgb(second).rgb),
  )

  return (lighter + 0.05) / (darker + 0.05)
}

function check(pair: ContrastPair, values: Readonly<Record<string, string>>): ContrastCheck {
  const foreground = values[pair.foreground]
  const background = values[pair.background]
  const required = REQUIRED_RATIO[pair.need]

  /*
   * A theme that does not declare one of the two is not a failure and not a
   * pass: the pair simply does not exist on that board. Reported as unknown so
   * a palette-only theme with a shorter token list does not light the panel up
   * red for tokens it never had.
   */
  if (foreground === undefined || background === undefined) {
    return { pair, required, ratio: null, state: 'unknown' }
  }

  const ratio = contrastRatio(foreground, background)
  return {
    pair,
    required,
    ratio,
    state: ratio === null ? 'unknown' : ratio >= required ? 'pass' : 'fail',
  }
}

/** Every pair, measured against one scheme's effective values. */
export function checkContrast(
  values: Readonly<Record<string, string>>,
  pairs: readonly ContrastPair[] = CONTRAST_PAIRS,
): readonly ContrastCheck[] {
  return pairs.map((pair) => check(pair, values))
}

/**
 * The pairs one token takes part in, measured.
 *
 * This is what puts the number *beside the field being changed* rather than only
 * in a panel at the side. An operator dragging `primary` toward a pale yellow
 * should be told the button label stopped being legible while they are still
 * holding the slider — not after they have scrolled somewhere else.
 */
export function contrastChecksFor(
  token: string,
  values: Readonly<Record<string, string>>,
): readonly ContrastCheck[] {
  return checkContrast(
    values,
    CONTRAST_PAIRS.filter((pair) => pair.foreground === token || pair.background === token),
  )
}

/** `4.7:1`, at the precision the numbers are actually compared at. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2).replace(/\.?0+$/, '')}:1`
}

/**
 * The WCAG level a ratio reaches, for the pair's own purpose.
 *
 * `AAA` is 7:1 for text and 4.5:1 for large text, and has no meaning at all for
 * a non-text pair — WCAG defines no enhanced level for a focus ring — so that
 * case tops out at "AA".
 */
export function contrastGrade(ratio: number, need: ContrastNeed): 'AAA' | 'AA' | 'Fails' {
  if (need === 'non-text') return ratio >= 3 ? 'AA' : 'Fails'
  const enhanced = need === 'text' ? 7 : 4.5
  if (ratio >= enhanced) return 'AAA'
  return ratio >= REQUIRED_RATIO[need] ? 'AA' : 'Fails'
}
