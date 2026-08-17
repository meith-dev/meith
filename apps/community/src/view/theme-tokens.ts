import type { Translator } from '@meith/i18n'

import { untranslated } from './time'

export type TokenKind = 'colour' | 'length' | 'text'

export interface TokenMeta {
  readonly labelKey: string
  readonly hintKey: string
  readonly kind: TokenKind
}

export interface TokenGroup<T> {
  readonly titleKey: string
  readonly blurbKey: string
  readonly tokens: readonly T[]
}

interface GroupSpec {
  readonly titleKey: string
  readonly blurbKey: string
  readonly tokens: readonly (readonly [string, string, string, TokenKind?])[]
}

const GROUPS: readonly GroupSpec[] = [
  {
    titleKey: 'themeToken.group.brand.title',
    blurbKey: 'themeToken.group.brand.blurb',
    tokens: [
      ['primary', 'themeToken.primary.label', 'themeToken.primary.hint'],
      ['primary-hover', 'themeToken.primary-hover.label', 'themeToken.primary-hover.hint'],
      [
        'primary-foreground',
        'themeToken.primary-foreground.label',
        'themeToken.primary-foreground.hint',
      ],
      ['ring', 'themeToken.ring.label', 'themeToken.ring.hint'],
    ],
  },
  {
    titleKey: 'themeToken.group.page-and-panels.title',
    blurbKey: 'themeToken.group.page-and-panels.blurb',
    tokens: [
      ['background', 'themeToken.background.label', 'themeToken.background.hint'],
      ['foreground', 'themeToken.foreground.label', 'themeToken.foreground.hint'],
      ['surface', 'themeToken.surface.label', 'themeToken.surface.hint'],
      ['card', 'themeToken.card.label', 'themeToken.card.hint'],
      ['card-foreground', 'themeToken.card-foreground.label', 'themeToken.card-foreground.hint'],
      ['muted', 'themeToken.muted.label', 'themeToken.muted.hint'],
      ['muted-foreground', 'themeToken.muted-foreground.label', 'themeToken.muted-foreground.hint'],
      ['secondary', 'themeToken.secondary.label', 'themeToken.secondary.hint'],
      [
        'secondary-foreground',
        'themeToken.secondary-foreground.label',
        'themeToken.secondary-foreground.hint',
      ],
      ['accent', 'themeToken.accent.label', 'themeToken.accent.hint'],
      [
        'accent-foreground',
        'themeToken.accent-foreground.label',
        'themeToken.accent-foreground.hint',
      ],
      ['border', 'themeToken.border.label', 'themeToken.border.hint'],
      ['input', 'themeToken.input.label', 'themeToken.input.hint'],
      ['shadow-tint', 'themeToken.shadow-tint.label', 'themeToken.shadow-tint.hint'],
    ],
  },
  {
    titleKey: 'themeToken.group.destructive-actions.title',
    blurbKey: 'themeToken.group.destructive-actions.blurb',
    tokens: [
      ['destructive', 'themeToken.destructive.label', 'themeToken.destructive.hint'],
      [
        'destructive-foreground',
        'themeToken.destructive-foreground.label',
        'themeToken.destructive-foreground.hint',
      ],
    ],
  },
  {
    titleKey: 'themeToken.group.forums-and-threads.title',
    blurbKey: 'themeToken.group.forums-and-threads.blurb',
    tokens: [
      ['forum-unread', 'themeToken.forum-unread.label', 'themeToken.forum-unread.hint'],
      ['forum-read', 'themeToken.forum-read.label', 'themeToken.forum-read.hint'],
      ['forum-locked', 'themeToken.forum-locked.label', 'themeToken.forum-locked.hint'],
      ['thread-pinned', 'themeToken.thread-pinned.label', 'themeToken.thread-pinned.hint'],
      ['thread-locked', 'themeToken.thread-locked.label', 'themeToken.thread-locked.hint'],
      ['thread-moved', 'themeToken.thread-moved.label', 'themeToken.thread-moved.hint'],
      [
        'thread-unapproved',
        'themeToken.thread-unapproved.label',
        'themeToken.thread-unapproved.hint',
      ],
      ['thread-deleted', 'themeToken.thread-deleted.label', 'themeToken.thread-deleted.hint'],
    ],
  },
  {
    titleKey: 'themeToken.group.posts.title',
    blurbKey: 'themeToken.group.posts.blurb',
    tokens: [
      ['post-highlight', 'themeToken.post-highlight.label', 'themeToken.post-highlight.hint'],
      ['post-own', 'themeToken.post-own.label', 'themeToken.post-own.hint'],
      ['post-unapproved', 'themeToken.post-unapproved.label', 'themeToken.post-unapproved.hint'],
    ],
  },
  {
    titleKey: 'themeToken.group.moderation.title',
    blurbKey: 'themeToken.group.moderation.blurb',
    tokens: [
      ['moderation-pending', 'themeToken.moderation-pending.label', ''],
      ['moderation-approved', 'themeToken.moderation-approved.label', ''],
      ['moderation-rejected', 'themeToken.moderation-rejected.label', ''],
    ],
  },
  {
    titleKey: 'themeToken.group.member-groups.title',
    blurbKey: 'themeToken.group.member-groups.blurb',
    tokens: [
      ['group-admin', 'themeToken.group-admin.label', ''],
      ['group-supermod', 'themeToken.group-supermod.label', ''],
      ['group-mod', 'themeToken.group-mod.label', ''],
      ['group-banned', 'themeToken.group-banned.label', ''],
    ],
  },
  {
    titleKey: 'themeToken.group.shape-and-type.title',
    blurbKey: 'themeToken.group.shape-and-type.blurb',
    tokens: [
      ['radius', 'themeToken.radius.label', 'themeToken.radius.hint', 'length'],
      ['density-unit', 'themeToken.density-unit.label', 'themeToken.density-unit.hint', 'length'],
      ['elevation', 'themeToken.elevation.label', 'themeToken.elevation.hint', 'text'],
      [
        'font-sans-stack',
        'themeToken.font-sans-stack.label',
        'themeToken.font-sans-stack.hint',
        'text',
      ],
      [
        'font-heading-stack',
        'themeToken.font-heading-stack.label',
        'themeToken.font-heading-stack.hint',
        'text',
      ],
      [
        'font-mono-stack',
        'themeToken.font-mono-stack.label',
        'themeToken.font-mono-stack.hint',
        'text',
      ],
    ],
  },
]

const META = new Map<string, TokenMeta>()
for (const group of GROUPS) {
  for (const [name, labelKey, hintKey, kind] of group.tokens) {
    META.set(name, { labelKey, hintKey, kind: kind ?? 'colour' })
  }
}

export function tokenMeta(name: string): TokenMeta {
  return META.get(name) ?? { labelKey: name, hintKey: '', kind: 'colour' }
}

export function tokenGroupCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  const copy: Record<string, string> = {
    'themeToken.group.other.title': t.t('themeToken.group.other.title'),
    'themeToken.group.other.blurb': t.t('themeToken.group.other.blurb'),
  }
  for (const group of GROUPS) {
    copy[group.titleKey] = t.t(group.titleKey)
    copy[group.blurbKey] = t.t(group.blurbKey)
  }
  for (const preset of BRAND_PRESETS) copy[preset.titleKey] = t.t(preset.titleKey)
  return copy
}

export function tokenCopy(
  name: string,
  t: Translator = untranslated(),
): { readonly label: string; readonly hint: string; readonly kind: TokenKind } {
  const meta = tokenMeta(name)
  return {
    label: t.has(meta.labelKey) ? t.t(meta.labelKey) : name,
    hint: meta.hintKey === '' ? '' : t.t(meta.hintKey),
    kind: meta.kind,
  }
}

export function isSchemeIndependent(name: string): boolean {
  return tokenMeta(name).kind !== 'colour'
}

export function groupTokens<T extends { readonly name: string }>(
  tokens: readonly T[],
): readonly TokenGroup<T>[] {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const groups: TokenGroup<T>[] = []
  const placed = new Set<string>()

  for (const group of GROUPS) {
    const members: T[] = []
    for (const [name] of group.tokens) {
      const token = byName.get(name)
      if (token === undefined) continue
      members.push(token)
      placed.add(name)
    }
    if (members.length > 0) {
      groups.push({ titleKey: group.titleKey, blurbKey: group.blurbKey, tokens: members })
    }
  }

  const rest = tokens.filter((token) => !placed.has(token.name))
  if (rest.length > 0) {
    groups.push({
      titleKey: 'themeToken.group.other.title',
      blurbKey: 'themeToken.group.other.blurb',
      tokens: rest,
    })
  }

  return groups
}

export const BRAND_TOKENS = ['primary', 'primary-hover', 'primary-foreground', 'ring'] as const

export interface BrandPreset {
  readonly key: string
  readonly titleKey: string
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

export const BRAND_PRESETS: readonly BrandPreset[] = [
  {
    key: 'meith',
    titleKey: 'themeToken.preset.meith',
    light: {
      primary: '#047857',
      'primary-hover': '#036045',
      'primary-foreground': '#ffffff',
      ring: '#047857',
    },
    dark: {
      primary: '#34d399',
      'primary-hover': '#5ee7b7',
      'primary-foreground': '#04160f',
      ring: '#34d399',
    },
  },
  {
    key: 'ocean',
    titleKey: 'themeToken.preset.ocean',
    light: {
      primary: '#1d4ed8',
      'primary-hover': '#1739a8',
      'primary-foreground': '#ffffff',
      ring: '#1d4ed8',
    },
    dark: {
      primary: '#93c5fd',
      'primary-hover': '#bfdbfe',
      'primary-foreground': '#0b1220',
      ring: '#93c5fd',
    },
  },
  {
    key: 'forest',
    titleKey: 'themeToken.preset.forest',
    light: {
      primary: '#15803d',
      'primary-hover': '#106430',
      'primary-foreground': '#ffffff',
      ring: '#15803d',
    },
    dark: {
      primary: '#86efac',
      'primary-hover': '#b2f5c9',
      'primary-foreground': '#052e16',
      ring: '#86efac',
    },
  },
  {
    key: 'plum',
    titleKey: 'themeToken.preset.plum',
    light: {
      primary: '#7e22ce',
      'primary-hover': '#651ba4',
      'primary-foreground': '#ffffff',
      ring: '#7e22ce',
    },
    dark: {
      primary: '#d8b4fe',
      'primary-hover': '#e7d0fe',
      'primary-foreground': '#2e1065',
      ring: '#d8b4fe',
    },
  },
  {
    key: 'rust',
    titleKey: 'themeToken.preset.rust',
    light: {
      primary: '#b91c1c',
      'primary-hover': '#961717',
      'primary-foreground': '#ffffff',
      ring: '#b91c1c',
    },
    dark: {
      primary: '#fca5a5',
      'primary-hover': '#fdc7c7',
      'primary-foreground': '#450a0a',
      ring: '#fca5a5',
    },
  },
  {
    key: 'sand',
    titleKey: 'themeToken.preset.sand',
    light: {
      primary: '#92400e',
      'primary-hover': '#74330b',
      'primary-foreground': '#ffffff',
      ring: '#92400e',
    },
    dark: {
      primary: '#fcd34d',
      'primary-hover': '#fde28a',
      'primary-foreground': '#3b2506',
      ring: '#fcd34d',
    },
  },
]
