'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError, isAppError, logger } from '@meith/core'
import { ReportService, parseTargetKind } from '@meith/moderation'

import { limitMessage, spendLimit } from './antispam'
import { getActor } from './context'
import { getContainer } from './container'
import { reportNotifier } from './notifications'
import { resolveReportScope } from './report-scope'
import type { FormState } from './auth-form-state'

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInt(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

function toFormState(err: unknown, values: Record<string, string> = {}): FormState {
  if (isAppError(err)) return { error: err.message, values }
  logger({ module: 'report-actions' }).error({ err }, 'unexpected error in reports')
  return { error: 'Something went wrong. Please try again.', values }
}

export async function fileReportAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const kind = parseTargetKind(field(form, 'kind'))
  const targetId = positiveInt(field(form, 'targetId'))
  const reason = field(form, 'reason')
  const values = { reason }

  if (kind === null || targetId === null) {
    return { error: 'That does not exist.', values }
  }

  const { authorizer, reports } = getContainer()
  if (reports === null) {
    return {
      error: 'This board is running on in-memory sample data, so it cannot take reports.',
      values,
    }
  }

  let target
  try {
    const actor = await getActor()
    if (actor.userId === null) {
      throw new ForbiddenError('You must be logged in to report anything.')
    }
    authorizer.require(actor, 'content.report')

    target = await reports.resolveTarget(kind, targetId, actor.userId)
    if (target === null) throw new ValidationError('That does not exist.')

    if (target.forumId !== null) {
      const matrix = await authorizer.forumMatrix(actor, target.forumId)
      if (!authorizer.can(actor, 'thread.view', { forumId: target.forumId, forum: matrix })) {
        throw new ValidationError('That does not exist.')
      }
    } else if (kind === 'user') {
      authorizer.require(actor, 'profile.view')
    }

    const limited = await spendLimit({ scope: 'report', actor })
    if (limited !== null && !limited.allowed) {
      return { error: limitMessage(limited), values }
    }

    const outcome = await new ReportService({ reports }).file({
      kind,
      targetId,
      reason,
      reporterUserId: actor.userId,
    })

    void outcome
  } catch (err) {
    return toFormState(err, values)
  }

  const back =
    target.threadId === null
      ? `/member/${target.id}?reported=1`
      : `/thread/${target.threadId}?reported=1`
  redirect(back)
}

export async function assignReportAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const reportId = positiveInt(field(form, 'reportId'))
  const take = field(form, 'take') === '1'
  if (reportId === null) return { error: 'That report does not exist.' }

  const { reports } = getContainer()
  if (reports === null) return { error: 'This board has no reports.' }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    await new ReportService({ reports }).assign({
      reportId,
      toUserId: take ? actor.userId : null,
      actorUserId: actor.userId,
      scope: await resolveReportScope(),
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/moderation/reports')
}

export async function closeReportAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const reportId = positiveInt(field(form, 'reportId'))
  const status = form.get('status')
  const note = field(form, 'note')

  if (reportId === null) return { error: 'That report does not exist.' }
  if (status !== 'resolved' && status !== 'rejected') {
    return { error: 'Choose resolve or dismiss.' }
  }

  const { reports } = getContainer()
  if (reports === null) return { error: 'This board has no reports.' }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    await new ReportService({ reports, notifier: reportNotifier() }).close({
      reportId,
      status,
      note,
      actorUserId: actor.userId,
      scope: await resolveReportScope(),
    })
  } catch (err) {
    return toFormState(err, { note })
  }

  redirect(`/moderation/reports?closed=${status}`)
}
