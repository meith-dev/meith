/** F53's pure warning view models. */
import type { TimeModel } from '@meith/theme-kit'
import type { WarningRow, WarningStanding, WarningType } from '@meith/moderation'

import { memberHref } from './member-profile'
import { formatTime } from './time'

export interface WarningHistoryRow {
  readonly id: number
  readonly title: string
  readonly points: number
  readonly reason: string
  readonly issuedBy: string
  readonly issuedAt: TimeModel
  /**
   * The post it cites, as a number rather than a link.
   *
   * There is no `/post/:id` route — a post is reached through its thread, and a
   * warning does not record which thread that was. A link to a page that 404s
   * is worse than no link (F39's rule), so the citation is text until F74 gives
   * the board a permalink resolver.
   */
  readonly postId: number | null
  /**
   * Why this row no longer counts, or `null` when it does.
   *
   * One field rather than two booleans plus two timestamps, because the screen
   * only ever renders one sentence and the *reason* it stopped counting is the
   * part a moderator reading a history cares about.
   */
  readonly lapsed: string | null
  /** Offered only for a warning that is still in force. */
  readonly revocable: boolean
}

export interface WarningStandingView {
  readonly points: number
  /** "Posts held for review", "Suspended from posting", "Banned", or null. */
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
  /**
   * The viewer's timezone (F57). Defaults to UTC — the zone every timestamp on
   * this board used before members could choose one.
   */
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
      /*
       * Points and expiry in the option label. A moderator choosing a reason is
       * choosing a sentence, and hiding the number until after they have issued
       * it makes the ladder something you learn by tripping it.
       */
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

function warningRow(
  row: WarningRow,
  now: Date,
  timeZone: string | undefined,
): WarningHistoryRow {
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

/** The notice after a warn or a revoke, assembled from the query string. */
export function warningNotice(query: {
  readonly warned?: string | undefined
  readonly level?: string | undefined
  readonly revoked?: string | undefined
}): string | null {
  if (query.warned !== undefined) {
    const level = query.level === undefined ? null : (LEVEL_LABELS[query.level] ?? null)
    const base = `Warning issued. They are now on ${query.warned} points.`
    /*
     * The level action is named, not implied. A moderator who has just
     * accidentally banned somebody by issuing a two-point warning needs to be
     * told at the moment it happens, not when the appeal arrives.
     */
    return level === null ? base : `${base} That reached a threshold: ${level}.`
  }
  if (query.revoked === 'already') return 'That warning had already been revoked.'
  if (query.revoked !== undefined) {
    return `Warning revoked. They are now on ${query.revoked} points.`
  }
  return null
}
