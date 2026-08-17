import type { WarningRow, WarningStanding, WarningType } from '@meith/moderation'
import type { TimeModel } from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { formatTime } from './time'

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

const LEVEL_LABELS: Readonly<Record<string, string>> = {
  moderate_posting: 'Posts held for review',
  suspend_posting: 'Suspended from posting',
  ban: 'Banned',
}

export function buildWarningView(input: {
  readonly member: { readonly userId: number; readonly username: string }
  readonly standing: WarningStanding
  readonly types: readonly WarningType[]
  readonly history: readonly WarningRow[]
  readonly nextCursor?: string | undefined
  readonly now: Date
  readonly timeZone?: string
}): WarningView {
  return {
    member: {
      userId: input.member.userId,
      username: input.member.username,
      href: memberHref(input.member.userId),
    },
    standing: {
      points: input.standing.points,
      levelLabel:
        input.standing.level === null
          ? null
          : (LEVEL_LABELS[input.standing.level.action] ?? input.standing.level.action),
      levelPoints: input.standing.level?.points ?? null,
    },
    types: input.types.map((type) => ({
      id: type.id,
      label: `${type.title} — ${type.points} ${type.points === 1 ? 'point' : 'points'}${
        type.expiryDays === null ? ', never expires' : `, expires after ${type.expiryDays} days`
      }`,
    })),
    history: input.history.map((row) => warningRow(row, input.now, input.timeZone)),
    nextHref:
      input.nextCursor === undefined
        ? null
        : `/moderation/warn?user=${input.member.userId}&after=${encodeURIComponent(input.nextCursor)}`,
  }
}

function warningRow(row: WarningRow, now: Date, timeZone: string | undefined): WarningHistoryRow {
  const lapsed =
    row.revokedAt !== null
      ? `Revoked by ${row.revokedByUsername ?? 'a moderator'}${
          row.revokeReason ? ` — ${row.revokeReason}` : ''
        }`
      : row.expiresAt !== null && row.expiresAt <= now
        ? `Expired ${formatTime(row.expiresAt, now, timeZone).label}`
        : null

  return {
    id: row.id,
    title: row.title,
    points: row.points,
    reason: row.reason,
    issuedBy: row.issuedByUsername ?? 'a former moderator',
    issuedAt: formatTime(row.createdAt, now, timeZone),
    postId: row.postId,
    lapsed,
    revocable: lapsed === null,
  }
}

export function warningNotice(query: {
  readonly warned?: string | undefined
  readonly level?: string | undefined
  readonly revoked?: string | undefined
}): string | null {
  if (query.warned !== undefined) {
    const level = query.level === undefined ? null : (LEVEL_LABELS[query.level] ?? null)
    const base = `Warning issued. They are now on ${query.warned} points.`
    return level === null ? base : `${base} That reached a threshold: ${level}.`
  }
  if (query.revoked === 'already') return 'That warning had already been revoked.'
  if (query.revoked !== undefined) {
    return `Warning revoked. They are now on ${query.revoked} points.`
  }
  return null
}
