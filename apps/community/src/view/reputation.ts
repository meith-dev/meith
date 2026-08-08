/** F62's pure reputation view models. */
import type { ReputationRow, ReputationSummary } from '@meith/reputation'
import type { TimeModel } from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { formatTime } from './time'

export interface ReputationRowView {
  readonly id: number
  readonly givenBy: string
  readonly givenByHref: string | null
  readonly points: number
  /** "+1", "0" or "−1", already signed for display. */
  readonly pointsLabel: string
  readonly comment: string
  /** The post it was left on, or null for a rating on the profile. */
  readonly postHref: string | null
  readonly at: TimeModel
  /** Set when the *viewer* gave this one, so they can take it back. */
  readonly isMine: boolean
}

export interface ReputationView {
  readonly summary: ReputationSummary
  readonly rows: readonly ReputationRowView[]
  readonly nextHref: string | null
  /** "You have 7 of 10 ratings left today", or null when uncapped. */
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
      /*
       * A rating whose giver has since been deleted still counts, so it still
       * appears — with a name that says what happened rather than a blank.
       * Somebody's reputation is a record of what the board thought, not a
       * list of currently-active accounts.
       */
      givenBy: row.givenByUsername ?? 'A deleted member',
      givenByHref: row.givenByUserId === null ? null : memberHref(row.givenByUserId),
      points: row.points,
      pointsLabel: signed(row.points),
      comment: row.comment,
      /*
       * A post rating links to the post, by thread *id* and anchor — no slug
       * and no title. A profile is visible to more people than every community is,
       * and the thread page enforces its own visibility, so a bare id leaks
       * nothing a 404 would not already say.
       */
      postHref:
        row.postId === null || row.threadId === null
          ? null
          : `/thread/${row.threadId}#post-${row.postId}`,
      at: formatTime(row.createdAt, input.now, input.timeZone),
      isMine: input.viewerUserId !== null && row.givenByUserId === input.viewerUserId,
    })),
    nextHref:
      input.nextBefore === null
        ? null
        : `/member/${input.userId}/reputation?before=${input.nextBefore}`,
    /*
     * Null when uncapped — 0 means unlimited on every numeric permission
     * (R4.2), and "0 of 0 left" is the reading that gets it wrong.
     */
    remainingLabel:
      input.maxPerDay <= 0
        ? null
        : `${Math.max(0, input.maxPerDay - input.givenToday)} of ${input.maxPerDay} ratings left today`,
  }
}

/** `+1`, `0`, `−1`. A real minus sign, not a hyphen. */
export function signed(points: number): string {
  if (points > 0) return `+${points}`
  if (points < 0) return `−${Math.abs(points)}`
  return '0'
}

/**
 * The one-line summary a profile shows.
 *
 * The breakdown rather than only the total, because "+3" hides the difference
 * between three people agreeing and twenty arguing.
 */
export function reputationLabel(summary: ReputationSummary): string {
  const detail = [
    summary.positive > 0 ? `${summary.positive} positive` : null,
    summary.neutral > 0 ? `${summary.neutral} neutral` : null,
    summary.negative > 0 ? `${summary.negative} negative` : null,
  ].filter((part): part is string => part !== null)

  return detail.length === 0
    ? 'No ratings yet'
    : `${signed(summary.total)} (${detail.join(', ')})`
}

/** The notice after an action, assembled from the query string. */
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
