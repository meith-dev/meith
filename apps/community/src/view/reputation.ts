import type { ReputationRow, ReputationSummary } from '@meith/reputation'
import type { TimeModel } from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { postLink } from './post-link'
import { formatTime } from './time'

export interface ReputationRowView {
  readonly id: number
  readonly givenBy: string
  readonly givenByHref: string | null
  readonly points: number
  readonly pointsLabel: string
  readonly comment: string
  readonly postHref: string | null
  readonly at: TimeModel
  readonly isMine: boolean
}

export interface ReputationView {
  readonly summary: ReputationSummary
  readonly rows: readonly ReputationRowView[]
  readonly nextHref: string | null
  readonly remainingLabel: string | null
}

export function buildReputationView(input: {
  readonly userId: number
  readonly summary: ReputationSummary
  readonly rows: readonly ReputationRow[]
  readonly nextBefore: number | null
  readonly viewerUserId: number | null
  readonly maxPerDay: number
  readonly givenToday: number
  readonly now: Date
  readonly timeZone?: string
}): ReputationView {
  return {
    summary: input.summary,
    rows: input.rows.map((row) => ({
      id: row.id,
      givenBy: row.givenByUsername ?? 'A deleted member',
      givenByHref: row.givenByUserId === null ? null : memberHref(row.givenByUserId),
      points: row.points,
      pointsLabel: signed(row.points),
      comment: row.comment,
      postHref:
        row.postId === null || row.threadId === null
          ? null
          : postLink(`/thread/${row.threadId}`, row.postId),
      at: formatTime(row.createdAt, input.now, input.timeZone),
      isMine: input.viewerUserId !== null && row.givenByUserId === input.viewerUserId,
    })),
    nextHref:
      input.nextBefore === null
        ? null
        : `/member/${input.userId}/reputation?before=${input.nextBefore}`,
    remainingLabel:
      input.maxPerDay <= 0
        ? null
        : `${Math.max(0, input.maxPerDay - input.givenToday)} of ${input.maxPerDay} ratings left today`,
  }
}

export function signed(points: number): string {
  if (points > 0) return `+${points}`
  if (points < 0) return `−${Math.abs(points)}`
  return '0'
}

export function reputationLabel(summary: ReputationSummary): string {
  const detail = [
    summary.positive > 0 ? `${summary.positive} positive` : null,
    summary.neutral > 0 ? `${summary.neutral} neutral` : null,
    summary.negative > 0 ? `${summary.negative} negative` : null,
  ].filter((part): part is string => part !== null)

  return detail.length === 0 ? 'No ratings yet' : `${signed(summary.total)} (${detail.join(', ')})`
}

export function reputationNotice(query: {
  readonly rated?: string | undefined
  readonly withdrawn?: string | undefined
}): { kind: 'info'; message: string } | null {
  if (query.rated !== undefined) {
    return { kind: 'info', message: 'Your rating has been recorded.' }
  }
  if (query.withdrawn !== undefined) {
    return { kind: 'info', message: 'Your rating has been withdrawn.' }
  }
  return null
}
