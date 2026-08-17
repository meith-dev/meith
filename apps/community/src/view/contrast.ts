import type { Translator } from '@meith/i18n'

import { oklchToRgb, parseColour, relativeLuminance } from './oklch'
import { untranslated } from './time'

export type ContrastNeed = 'text' | 'large-text' | 'non-text'

export const REQUIRED_RATIO: Readonly<Record<ContrastNeed, number>> = {
  text: 4.5,
  'large-text': 3,
  'non-text': 3,
}

export interface ContrastPair {
  readonly foreground: string
  readonly background: string
  readonly labelKey: string
  readonly need: ContrastNeed
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  {
    foreground: 'foreground',
    background: 'background',
    labelKey: 'contrast.foreground-on-background',
    need: 'text',
  },
  {
    foreground: 'foreground',
    background: 'surface',
    labelKey: 'contrast.foreground-on-surface',
    need: 'text',
  },
  {
    foreground: 'card-foreground',
    background: 'card',
    labelKey: 'contrast.card-foreground-on-card',
    need: 'text',
  },
  {
    foreground: 'muted-foreground',
    background: 'card',
    labelKey: 'contrast.muted-foreground-on-card',
    need: 'text',
  },
  {
    foreground: 'muted-foreground',
    background: 'background',
    labelKey: 'contrast.muted-foreground-on-background',
    need: 'text',
  },
  {
    foreground: 'primary-foreground',
    background: 'primary',
    labelKey: 'contrast.primary-foreground-on-primary',
    need: 'text',
  },
  {
    foreground: 'primary-foreground',
    background: 'primary-hover',
    labelKey: 'contrast.primary-foreground-on-primary-hover',
    need: 'text',
  },
  {
    foreground: 'secondary-foreground',
    background: 'secondary',
    labelKey: 'contrast.secondary-foreground-on-secondary',
    need: 'text',
  },
  {
    foreground: 'destructive-foreground',
    background: 'destructive',
    labelKey: 'contrast.destructive-foreground-on-destructive',
    need: 'text',
  },
  {
    foreground: 'accent-foreground',
    background: 'accent',
    labelKey: 'contrast.accent-foreground-on-accent',
    need: 'text',
  },

  {
    foreground: 'card-foreground',
    background: 'post-highlight',
    labelKey: 'contrast.card-foreground-on-post-highlight',
    need: 'text',
  },
  {
    foreground: 'card-foreground',
    background: 'post-own',
    labelKey: 'contrast.card-foreground-on-post-own',
    need: 'text',
  },
  {
    foreground: 'card-foreground',
    background: 'post-unapproved',
    labelKey: 'contrast.card-foreground-on-post-unapproved',
    need: 'text',
  },

  {
    foreground: 'forum-unread',
    background: 'card',
    labelKey: 'contrast.forum-unread-on-card',
    need: 'text',
  },
  {
    foreground: 'forum-read',
    background: 'card',
    labelKey: 'contrast.forum-read-on-card',
    need: 'text',
  },
  {
    foreground: 'forum-locked',
    background: 'card',
    labelKey: 'contrast.forum-locked-on-card',
    need: 'text',
  },
  {
    foreground: 'thread-pinned',
    background: 'card',
    labelKey: 'contrast.thread-pinned-on-card',
    need: 'text',
  },
  {
    foreground: 'thread-locked',
    background: 'card',
    labelKey: 'contrast.thread-locked-on-card',
    need: 'text',
  },
  {
    foreground: 'thread-moved',
    background: 'card',
    labelKey: 'contrast.thread-moved-on-card',
    need: 'text',
  },
  {
    foreground: 'thread-unapproved',
    background: 'card',
    labelKey: 'contrast.thread-unapproved-on-card',
    need: 'text',
  },
  {
    foreground: 'thread-deleted',
    background: 'card',
    labelKey: 'contrast.thread-deleted-on-card',
    need: 'text',
  },

  {
    foreground: 'moderation-pending',
    background: 'card',
    labelKey: 'contrast.moderation-pending-on-card',
    need: 'text',
  },
  {
    foreground: 'moderation-approved',
    background: 'card',
    labelKey: 'contrast.moderation-approved-on-card',
    need: 'text',
  },
  {
    foreground: 'moderation-rejected',
    background: 'card',
    labelKey: 'contrast.moderation-rejected-on-card',
    need: 'text',
  },

  {
    foreground: 'group-admin',
    background: 'card',
    labelKey: 'contrast.group-admin-on-card',
    need: 'text',
  },
  {
    foreground: 'group-supermod',
    background: 'card',
    labelKey: 'contrast.group-supermod-on-card',
    need: 'text',
  },
  {
    foreground: 'group-mod',
    background: 'card',
    labelKey: 'contrast.group-mod-on-card',
    need: 'text',
  },
  {
    foreground: 'group-banned',
    background: 'card',
    labelKey: 'contrast.group-banned-on-card',
    need: 'text',
  },

  {
    foreground: 'ring',
    background: 'background',
    labelKey: 'contrast.ring-on-background',
    need: 'non-text',
  },
  {
    foreground: 'ring',
    background: 'card',
    labelKey: 'contrast.ring-on-card',
    need: 'non-text',
  },
  { foreground: 'input', background: 'card', labelKey: 'contrast.input-on-card', need: 'non-text' },
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

export function contrastCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  const copy: Record<string, string> = {}
  for (const pair of CONTRAST_PAIRS) copy[pair.labelKey] = t.t(pair.labelKey)
  return copy
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
