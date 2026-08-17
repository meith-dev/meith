'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError } from '@meith/core'
import { msg } from '@meith/i18n'
import { WarningService } from '@meith/moderation'

import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveInt, text } from './form-values'
import { tr } from './i18n'
import { warningNotifier } from './notifications'

const toFormState = formStateReporter('warning-actions', 'unexpected error in warnings')

export async function issueWarningAction(_prev: FormState, form: FormData): Promise<FormState> {
  const userId = positiveInt(form, 'userId')
  if (userId === null) return { error: await tr('notice.app.member-exist') }

  const { authorizer, warnings, warningBans } = getContainer()
  if (warnings === null) {
    return {
      error: await tr('notice.app.board-running-in-memory-sample-data'),
    }
  }

  let outcome: Awaited<ReturnType<WarningService['issue']>>
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const mayWarn = authorizer.can(actor, 'user.warn')

    const postId = positiveInt(form, 'postId')
    const evidence =
      postId !== null && (await warnings.findPostAuthor(postId)) === userId ? postId : null

    outcome = await new WarningService({
      warnings,
      bans: warningBans,
      notifier: warningNotifier(),
    }).issue({
      userId,
      actorUserId: actor.userId,
      typeId: positiveInt(form, 'typeId'),
      title: text(form, 'title'),
      points: positiveInt(form, 'points') ?? undefined,
      reason: text(form, 'reason'),
      postId: evidence,
      mayWarn,
    })
  } catch (err) {
    return toFormState(err)
  }

  const query = [`warned=${outcome.points}`]
  if (outcome.triggered !== null) query.push(`level=${outcome.triggered.action}`)
  redirect(`/moderation/warn?user=${userId}&${query.join('&')}`)
}

export async function revokeWarningAction(_prev: FormState, form: FormData): Promise<FormState> {
  const warningId = positiveInt(form, 'warningId')
  const userId = positiveInt(form, 'userId')
  if (warningId === null || userId === null) {
    return { error: await tr('notice.app.warning-exist') }
  }

  const { authorizer, warnings, warningBans } = getContainer()
  if (warnings === null) {
    return {
      error: await tr('notice.app.board-running-in-memory-sample-data'),
    }
  }

  let standing: Awaited<ReturnType<WarningService['revoke']>>
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    standing = await new WarningService({ warnings, bans: warningBans }).revoke({
      warningId,
      actorUserId: actor.userId,
      reason: text(form, 'reason'),
      mayWarn: authorizer.can(actor, 'user.warn'),
    })
  } catch (err) {
    return toFormState(err)
  }

  if (standing === null) {
    redirect(`/moderation/warn?user=${userId}&revoked=already`)
  }
  redirect(`/moderation/warn?user=${userId}&revoked=${standing.points}`)
}

export async function canWarn(): Promise<boolean> {
  const { authorizer } = getContainer()
  return authorizer.can(await getActor(), 'user.warn')
}
