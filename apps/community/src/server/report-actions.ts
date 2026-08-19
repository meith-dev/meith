'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { msg } from '@meith/i18n'
import { parseTargetKind, ReportService } from '@meith/moderation'

import { limitMessage, spendLimit } from './antispam'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveIntIn } from './form-values'
import { tr } from './i18n'
import { reportNotifier } from './notifications'
import { emitEvent } from './plugin-view'
import { resolveReportScope } from './report-scope'

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

const toFormState = formStateReporter('report-actions', 'unexpected error in reports')

export async function fileReportAction(_prev: FormState, form: FormData): Promise<FormState> {
  const kind = parseTargetKind(field(form, 'kind'))
  const targetId = positiveIntIn(field(form, 'targetId'))
  const reason = field(form, 'reason')
  const values = { reason }

  if (kind === null || targetId === null) {
    return { error: await tr('notice.app.exist'), values }
  }

  const { authorizer, reports } = getContainer()
  if (reports === null) {
    return {
      error: await tr('notice.app.board-running-in-memory-sample-data-5'),
      values,
    }
  }

  let target: Awaited<ReturnType<NonNullable<typeof reports>['resolveTarget']>>
  try {
    const actor = await getActor()
    if (actor.userId === null) {
      throw new ForbiddenError(msg('error.app.must-logged-report-anything'))
    }
    authorizer.require(actor, 'content.report')

    target = await reports.resolveTarget(kind, targetId, actor.userId)
    if (target === null) throw new ValidationError(msg('error.app.exist'))

    if (target.forumId !== null) {
      const matrix = await authorizer.forumMatrix(actor, target.forumId)
      const scope = {
        ...(await authorizer.moderatorTargetIn(actor, target.forumId, matrix)),
        threadAuthorId: target.threadAuthorUserId,
      }
      if (!authorizer.can(actor, 'thread.view', scope)) {
        throw new ValidationError(msg('error.app.exist'))
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

    if (!outcome.duplicate) {
      await emitEvent(
        'report.created',
        {
          reportId: outcome.reportId,
          target: kind === 'private_message' ? 'pm' : kind,
          targetId,
          reporterId: actor.userId,
        },
        { requestId: currentRequestId() ?? null },
      )
    }
  } catch (err) {
    return toFormState(err, values)
  }

  const back =
    target.threadId === null
      ? `/member/${target.id}?reported=1`
      : `/thread/${target.threadId}?reported=1`
  redirect(back)
}

export async function assignReportAction(_prev: FormState, form: FormData): Promise<FormState> {
  const reportId = positiveIntIn(field(form, 'reportId'))
  const take = field(form, 'take') === '1'
  if (reportId === null) return { error: await tr('notice.app.report-exist') }

  const { reports } = getContainer()
  if (reports === null) return { error: await tr('notice.app.board-reports') }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    await new ReportService({ reports }).assign({
      reportId,
      toUserId: take ? actor.userId : null,
      actorUserId: actor.userId,
      scope: await resolveReportScope(),
    })
  } catch (err) {
    return toFormState(err, {})
  }

  redirect('/moderation/reports')
}

export async function closeReportAction(_prev: FormState, form: FormData): Promise<FormState> {
  const reportId = positiveIntIn(field(form, 'reportId'))
  const status = form.get('status')
  const note = field(form, 'note')

  if (reportId === null) return { error: await tr('notice.app.report-exist') }
  if (status !== 'resolved' && status !== 'rejected') {
    return { error: await tr('notice.app.choose-resolve-dismiss') }
  }

  const { reports } = getContainer()
  if (reports === null) return { error: await tr('notice.app.board-reports') }

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    await new ReportService({ reports, notifier: reportNotifier() }).close({
      reportId,
      status,
      note,
      actorUserId: actor.userId,
      scope: await resolveReportScope(),
    })

    await emitEvent(
      'report.resolved',
      { reportId, resolution: status === 'resolved' ? 'actioned' : 'rejected' },
      { moderatorId: actor.userId, reason: note === '' ? null : note },
    )
  } catch (err) {
    return toFormState(err, { note })
  }

  redirect(`/moderation/reports?closed=${status}`)
}
