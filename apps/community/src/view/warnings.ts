import type { Translator } from '@meith/i18n'
import type { WarningRow, WarningStanding, WarningType } from '@meith/moderation'
import type { TimeModel } from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { formatTime, untranslated } from './time'

export interface WarningHistoryRow {
  readonly id: number
  readonly title: string
  readonly points: number
  readonly reason: string
  readonly issuedBy: string
  readonly issuedAt: TimeModel
  readonly postId: number | null
  readonly lapsed: string | null
  readonly revocable: boolean
}

export interface WarningStandingView {
  readonly points: number
  readonly levelLabel: string | null
  readonly levelPoints: number | null
}

export interface WarningView {
  readonly member: { readonly userId: number; readonly username: string; readonly href: string }
  readonly standing: WarningStandingView
  readonly types: readonly {
    readonly id: number
    readonly label: string
  }[]
  readonly history: readonly WarningHistoryRow[]
  readonly nextHref: string | null
}

function levelLabel(action: string, t: Translator): string {
  const key = LEVEL_KEYS[action]
  return key === undefined ? action : t.t(key)
}

const LEVEL_KEYS: Readonly<Record<string, string>> = {
  moderate_posting: 'warning.level.moderate_posting',
  suspend_posting: 'warning.level.suspend_posting',
  ban: 'warning.level.ban',
}

export function buildWarningView(input: {
  readonly member: { readonly userId: number; readonly username: string }
  readonly standing: WarningStanding
  readonly types: readonly WarningType[]
  readonly history: readonly WarningRow[]
  readonly nextCursor?: string | undefined
  readonly now: Date
  readonly t?: Translator
}): WarningView {
  const t = input.t ?? untranslated()

  return {
    member: {
      userId: input.member.userId,
      username: input.member.username,
      href: memberHref(input.member.userId),
    },
    standing: {
      points: input.standing.points,
      levelLabel: input.standing.level === null ? null : levelLabel(input.standing.level.action, t),
      levelPoints: input.standing.level?.points ?? null,
    },
    types: input.types.map((type) => ({
      id: type.id,
      label: t.t(type.expiryDays === null ? 'warning.type' : 'warning.typeExpiring', {
        title: type.title,
        points: type.points,
        days: type.expiryDays ?? 0,
      }),
    })),
    history: input.history.map((row) => warningRow(row, input.now, input.t)),
    nextHref:
      input.nextCursor === undefined
        ? null
        : `/moderation/warn?user=${input.member.userId}&after=${encodeURIComponent(input.nextCursor)}`,
  }
}

function warningRow(row: WarningRow, now: Date, t: Translator | undefined): WarningHistoryRow {
  const lapsed =
    row.revokedAt !== null
      ? `Revoked by ${row.revokedByUsername ?? 'a moderator'}${
          row.revokeReason ? ` — ${row.revokeReason}` : ''
        }`
      : row.expiresAt !== null && row.expiresAt <= now
        ? `Expired ${formatTime(row.expiresAt, now, t).label}`
        : null

  return {
    id: row.id,
    title: row.title,
    points: row.points,
    reason: row.reason,
    issuedBy: row.issuedByUsername ?? 'a former moderator',
    issuedAt: formatTime(row.createdAt, now, t),
    postId: row.postId,
    lapsed,
    revocable: lapsed === null,
  }
}

export function warningNotice(
  query: {
    readonly warned?: string | undefined
    readonly level?: string | undefined
    readonly revoked?: string | undefined
  },
  t: Translator = untranslated(),
): string | null {
  if (query.warned !== undefined) {
    const key = query.level === undefined ? undefined : LEVEL_KEYS[query.level]
    const issued = t.t('warning.issued', { points: query.warned })
    if (key === undefined) return issued
    return `${issued} ${t.t('warning.threshold', { level: t.t(key) })}`
  }
  if (query.revoked === 'already') return t.t('warning.revokedAlready')
  if (query.revoked !== undefined) {
    return t.t('warning.revoked', { points: query.revoked })
  }
  return null
}
