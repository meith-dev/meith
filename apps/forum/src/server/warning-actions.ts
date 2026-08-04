'use server'

/**
 * F53 — the warning Server Actions.
 *
 * Two verbs, one permission. `user.warn` is global (see the `Action` type for
 * why a warning has no forum), so unlike every other moderator action in Phase
 * 4 there is no matrix to resolve and no appointment to read — which makes the
 * *other* checks the interesting ones:
 *
 *   - the target is re-read, so a warning cannot be aimed at a deleted account;
 *   - a post named in the form is re-read for its author, so `?post=` cannot
 *     attach somebody else's post to this warning as evidence;
 *   - warning yourself is refused, because the level actions include a ban.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, isAppError, logger } from '@meith/core'
import { WarningService } from '@meith/moderation'

import { getActor } from './context'
import { getContainer } from './container'
import { warningNotifier } from './notifications'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'warning-actions' }).error({ err }, 'unexpected error in warnings')
  return { error: 'Something went wrong. Please try again.' }
}

function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

export async function issueWarningAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = positiveInt(form, 'userId')
  if (userId === null) return { error: 'That member does not exist.' }

  const { authorizer, warnings, warningBans } = getContainer()
  if (warnings === null) {
    return {
      error: 'This board is running on in-memory sample data, so it has no warnings.',
    }
  }

  let outcome
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    /*
     * Resolved here rather than trusted from the form, and asked through
     * `can()` so the administrator bypass stays logged (R4).
     */
    const mayWarn = authorizer.can(actor, 'user.warn')

    /*
     * The evidence, re-read. `?post=` arrives in the URL of a page a moderator
     * reached from somewhere, and a warning that cites a post by a *different*
     * member is a record that says the wrong thing about what happened.
     */
    const postId = positiveInt(form, 'postId')
    const evidence =
      postId !== null && (await warnings.findPostAuthor(postId)) === userId ? postId : null

    /*
     * F55's notifier closes the gap F53's row named: until now a warned member
     * found out by trying to post and being refused. Absent in fixture mode,
     * which the service treats as "nobody is told" rather than as an error.
     */
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

export async function revokeWarningAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const warningId = positiveInt(form, 'warningId')
  const userId = positiveInt(form, 'userId')
  if (warningId === null || userId === null) {
    return { error: 'That warning does not exist.' }
  }

  const { authorizer, warnings, warningBans } = getContainer()
  if (warnings === null) {
    return {
      error: 'This board is running on in-memory sample data, so it has no warnings.',
    }
  }

  let standing
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

    standing = await new WarningService({ warnings, bans: warningBans }).revoke({
      warningId,
      actorUserId: actor.userId,
      reason: text(form, 'reason'),
      mayWarn: authorizer.can(actor, 'user.warn'),
    })
  } catch (err) {
    return toFormState(err)
  }

  /*
   * `null` means it was already revoked — a double submit, or somebody else got
   * there first. Not an error: the warning is in the state the moderator wanted
   * it in, and the page will show that.
   */
  if (standing === null) {
    redirect(`/moderation/warn?user=${userId}&revoked=already`)
  }
  redirect(`/moderation/warn?user=${userId}&revoked=${standing.points}`)
}

/**
 * Whether this actor may reach the warning screens at all.
 *
 * Exported so the page and the links ask the same question the actions do —
 * three callers, one answer. A `'use server'` module may only export async
 * functions, which is why this is one.
 */
export async function canWarn(): Promise<boolean> {
  const { authorizer } = getContainer()
  return authorizer.can(await getActor(), 'user.warn')
}
