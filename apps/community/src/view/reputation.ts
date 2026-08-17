import type { Translator } from '@meith/i18n'
import type { ReputationRow, ReputationSummary } from '@meith/reputation'
import type { TimeModel } from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { postLink } from './post-link'
import { formatTime, untranslated } from './time'

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
  readonly t?: Translator
}): ReputationView {
  const t = input.t ?? untranslated()

  return {
    summary: input.summary,
    rows: input.rows.map((row) => ({
      id: row.id,
      givenBy: row.givenByUsername ?? t.t('reputation.deletedMember'),
      givenByHref: row.givenByUserId === null ? null : memberHref(row.givenByUserId),
      points: row.points,
      pointsLabel: signed(row.points, t),
      comment: row.comment,
      postHref:
        row.postId === null || row.threadId === null
          ? null
          : postLink(`/thread/${row.threadId}`, row.postId),
      at: formatTime(row.createdAt, input.now, input.t),
      isMine: input.viewerUserId !== null && row.givenByUserId === input.viewerUserId,
    })),
    nextHref:
      input.nextBefore === null
        ? null
        : `/member/${input.userId}/reputation?before=${input.nextBefore}`,
    remainingLabel:
      input.maxPerDay <= 0
        ? null
        : t.t('reputation.ratingsLeft', {
            left: Math.max(0, input.maxPerDay - input.givenToday),
            max: input.maxPerDay,
          }),
  }
}

export function signed(points: number, t: Translator = untranslated()): string {
  return t.number(points, { signDisplay: points === 0 ? 'never' : 'always' })
}

export function reputationLabel(
  summary: ReputationSummary,
  t: Translator = untranslated(),
): string {
  const detail = [
    summary.positive > 0 ? t.t('reputation.positive', { count: summary.positive }) : null,
    summary.neutral > 0 ? t.t('reputation.neutral', { count: summary.neutral }) : null,
    summary.negative > 0 ? t.t('reputation.negative', { count: summary.negative }) : null,
  ].filter((part): part is string => part !== null)

  if (detail.length === 0) return t.t('reputation.none')

  return t.t('reputation.summary', {
    total: signed(summary.total, t),
    detail: t.list(detail, { type: 'unit' }),
  })
}

export function reputationNotice(
  query: {
    readonly rated?: string | undefined
    readonly withdrawn?: string | undefined
  },
  t: Translator = untranslated(),
): { kind: 'info'; message: string } | null {
  if (query.rated !== undefined) {
    return { kind: 'info', message: t.t('reputation.recorded') }
  }
  if (query.withdrawn !== undefined) {
    return { kind: 'info', message: t.t('reputation.withdrawn') }
  }
  return null
}
