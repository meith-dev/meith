export const ICON_PATHS = {
  trophy: 'M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v7m-4 0h8',
  medal: 'm7 3 5 7 5-7M4 3h5m6 0h5M17 15a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  star: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z',
  crown: 'm3 6 5 5 4-8 4 8 5-5-2 13H5Zm2 10h14',
  heart: 'M12 21 3 12C-2 5 7 0 12 7c5-7 14-2 9 5Z',
  flame: 'M12 2c2 7-6 8-3 12 3 0 4-3 4-5 9 7 4 13-1 13S1 15 7 9c0 3 1 3 1 3-2-5 4-7 4-10Z',
  gem: 'm3 8 4-5h10l4 5-9 13Zm0 0h18M7 3l5 18 5-18',
  ribbon: 'M17 8A5 5 0 1 1 7 8a5 5 0 0 1 10 0Zm-9 4-2 9 6-3 6 3-2-9',
  rocket:
    'M9 15 5 11C9 3 16 2 22 2c0 6-1 13-9 17Zm-4-4-3 2v4l7-2m4 4-2 3H7l2-7m6-8h2v2h-2Zm-10 12-3 3',
  book: 'M12 5C8 2 4 3 2 4v16c4-2 7-2 10 0 3-2 6-2 10 0V4c-2-1-6-2-10 1Zm0 0v15',
  handshake: 'm2 8 4-4 5 2 3-2 8 5-4 9-4 3-8-5Zm9-2-4 5 3 2 4-4 6 6m-10 0 5 4m-7-1 4 3',
} as const

export type IconKind = 'emoji' | 'svg' | 'image'
export interface AwardDraft {
  readonly name: string
  readonly description: string
  readonly icon_kind: IconKind
  readonly icon: string
  readonly display_order: number
  readonly allow_multiple: boolean
  readonly listed: boolean
}
export interface Award extends AwardDraft {
  readonly id: number
  readonly archived_at: Date | string | null
}

export function asId(value: string | undefined): number | null {
  if (!/^[1-9]\d*$/.test(value ?? '')) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function parseIcon(value: string): { icon_kind: IconKind; icon: string } | null {
  const icon = value.trim()
  if (Object.hasOwn(ICON_PATHS, icon)) return { icon_kind: 'svg', icon }
  if (icon.length > 2048 || /[\s\\\p{Cc}]/u.test(icon)) return null
  if (icon[0] === '/' && icon[1] !== '/') return { icon_kind: 'image', icon }
  try {
    const url = new URL(icon)
    if (url.protocol === 'https:' && !url.username && !url.password) {
      return { icon_kind: 'image', icon: url.href }
    }
  } catch {}
  if (
    /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*)$/u.test(
      icon,
    )
  ) {
    return { icon_kind: 'emoji', icon }
  }
  return null
}

export function parseAward(
  form: Readonly<Record<string, string>>,
): { draft: AwardDraft; error?: never } | { draft?: never; error: 'invalid' | 'icon' } {
  const name = (form.name ?? '').trim()
  const description = (form.description ?? '').trim()
  const order = form.display_order?.trim() || '0'
  const display_order = Number(order)
  if (
    !name ||
    name.length > 120 ||
    description.length > 2000 ||
    !/^\d+$/.test(order) ||
    !Number.isSafeInteger(display_order) ||
    display_order > 2147483647
  )
    return { error: 'invalid' }
  const icon = parseIcon(form.icon ?? '🏆')
  if (icon === null) return { error: 'icon' }
  return {
    draft: {
      name,
      description,
      ...icon,
      display_order,
      allow_multiple: form.allow_multiple === 'on',
      listed: form.listed === 'on',
    },
  }
}

export function postbitLimit(
  settings: Readonly<Record<string, string | number | boolean>>,
): number {
  const value = Number(settings.postbit_limit ?? 5)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.floor(value))) : 5
}

export interface DisplayAward extends Award, Record<string, unknown> {
  readonly count: number
  readonly total: number
}
