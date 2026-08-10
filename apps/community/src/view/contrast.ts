import { oklchToRgb, parseColour, relativeLuminance } from './oklch'

export type ContrastNeed = 'text' | 'large-text' | 'non-text'

export const REQUIRED_RATIO: Readonly<Record<ContrastNeed, number>> = {
  text: 4.5,
  'large-text': 3,
  'non-text': 3,
}

export interface ContrastPair {
  readonly foreground: string
  readonly background: string
  readonly label: string
  readonly need: ContrastNeed
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'foreground', background: 'background', label: 'Body text on the page', need: 'text' },
  { foreground: 'foreground', background: 'surface', label: 'Text on a band — the header, a table heading', need: 'text' },
  { foreground: 'card-foreground', background: 'card', label: 'Text in a panel — a post, a forum row', need: 'text' },
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

  { foreground: 'forum-unread', background: 'card', label: 'A forum with new posts, in its row', need: 'text' },
  { foreground: 'forum-read', background: 'card', label: 'A forum with nothing new', need: 'text' },
  { foreground: 'forum-locked', background: 'card', label: 'A closed forum', need: 'text' },
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

  { foreground: 'ring', background: 'background', label: 'The focus outline on the page', need: 'non-text' },
  { foreground: 'ring', background: 'card', label: 'The focus outline in a panel', need: 'non-text' },
  { foreground: 'input', background: 'card', label: 'A field’s edge in a panel', need: 'non-text' },
]

export type ContrastState = 'pass' | 'fail' | 'unknown'

export interface ContrastCheck {
  readonly pair: ContrastPair
  readonly required: number
  readonly ratio: number | null
  readonly state: ContrastState
}

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

export function checkContrast(
  values: Readonly<Record<string, string>>,
  pairs: readonly ContrastPair[] = CONTRAST_PAIRS,
): readonly ContrastCheck[] {
  return pairs.map((pair) => check(pair, values))
}

export function contrastChecksFor(
  token: string,
  values: Readonly<Record<string, string>>,
): readonly ContrastCheck[] {
  return checkContrast(
    values,
    CONTRAST_PAIRS.filter((pair) => pair.foreground === token || pair.background === token),
  )
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2).replace(/\.?0+$/, '')}:1`
}

export function contrastGrade(ratio: number, need: ContrastNeed): 'AAA' | 'AA' | 'Fails' {
  if (need === 'non-text') return ratio >= 3 ? 'AA' : 'Fails'
  const enhanced = need === 'text' ? 7 : 4.5
  if (ratio >= enhanced) return 'AAA'
  return ratio >= REQUIRED_RATIO[need] ? 'AA' : 'Fails'
}
