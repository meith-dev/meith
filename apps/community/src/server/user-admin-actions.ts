'use server'

import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import { drivers } from '@meith/drivers'
import { revalidatePath } from 'next/cache'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { assertDemoIdentityUnchanged } from './demo'
import { banService, requireUserAdmin, requireUserBulk, requireUserMerge } from './user-admin'
import type { FormState } from './auth-form-state'

const MERGE_CHUNK = 500

const PRUNE_CHUNK = 500

const MASS_MAIL_CHUNK = 500

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function userId(form: FormData): number {
  const id = Number(text(form, 'userId'))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('No such member.')
  return id
}

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'user-admin' }).error({ err }, 'user administration write failed')
  return { error: 'Something went wrong. Please try again.' }
}

async function invalidatePermissions(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.permissions()])
  revalidatePath('/admin/users')
  revalidatePath('/admin/users/[id]', 'page')
}

export async function saveMemberAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = userId(form)

    const primaryGroupId = Number(text(form, 'primaryGroupId'))
    if (!Number.isSafeInteger(primaryGroupId) || primaryGroupId <= 0) {
      throw new ValidationError('No such group.')
    }

    const displayRaw = text(form, 'displayGroupId')
    const displayGroupId = displayRaw === '' ? null : Number(displayRaw)
    if (displayGroupId !== null && (!Number.isSafeInteger(displayGroupId) || displayGroupId <= 0)) {
      throw new ValidationError('No such display group.')
    }

    const username = text(form, 'username')
    const email = text(form, 'email')
    await assertDemoIdentityUnchanged(id, { username, email })

    await requireUserAdmin().updateAccount(id, {
      username,
      email,
      primaryGroupId,
      displayGroupId,
    })

    await invalidatePermissions()
    await recordAdminAction({ action: 'user.account_changed', detail: { userId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function setMemberStateAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = userId(form)

    const state = text(form, 'state')
    if (state !== 'active' && state !== 'awaiting_activation') {
      throw new ValidationError('Choose active or awaiting activation.')
    }

    await requireUserAdmin().setState(id, state)

    await invalidatePermissions()
    await recordAdminAction({ action: 'user.state_changed', detail: { userId: id, state } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function banMemberAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const context = await requireFreshAdmin()
    const id = userId(form)

    const days = text(form, 'days')
    let expiresAt: Date | undefined
    if (days !== '') {
      const parsed = Number(days)
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new ValidationError('A ban lasts a whole number of days, or is permanent.')
      }
      expiresAt = new Date(Date.now() + parsed * 86_400_000)
    }

    await banService().ban({
      userId: id,
      bannedByUserId: context.session.userId,
      ...(text(form, 'reason') === '' ? {} : { reason: text(form, 'reason') }),
      ...(text(form, 'publicReason') === ''
        ? {}
        : { publicReason: text(form, 'publicReason') }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    })

    await invalidatePermissions()
    await recordAdminAction({
      action: 'user.banned',
      detail: { userId: id, days: days === '' ? null : Number(days) },
    })

    return { notice: 'banned' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function saveSecondaryGroupsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const context = await requireAdmin()
    const id = userId(form)

    const groupIds: number[] = []
    for (const value of form.getAll('groupIds')) {
      const parsed = Number(typeof value === 'string' ? value : '')
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new ValidationError('No such group.')
      }
      groupIds.push(parsed)
    }

    await requireUserAdmin().setSecondaryGroups(id, groupIds, context.session.userId)

    await invalidatePermissions()
    await recordAdminAction({
      action: 'user.groups_changed',
      detail: { userId: id, groups: groupIds.length },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function mergeStepAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const fromUserId = userId(form)
    const toUserId = Number(text(form, 'toUserId'))
    if (!Number.isSafeInteger(toUserId) || toUserId <= 0) {
      throw new ValidationError('Choose an account to merge into.')
    }
    if (fromUserId === toUserId) {
      throw new ValidationError('Choose two different accounts.')
    }

    const merge = requireUserMerge()
    const chunk = await merge.mergePostsChunk(fromUserId, toUserId, MERGE_CHUNK)

    if (chunk.remaining > 0) {
      await recordAdminAction({
        action: 'user.merge_progress',
        detail: { fromUserId, toUserId, moved: chunk.moved, remaining: chunk.remaining },
      })
      return {
        notice: 'more',
        values: { toUserId: String(toUserId), remaining: String(chunk.remaining) },
      }
    }

    await merge.finish(fromUserId, toUserId)

    await invalidatePermissions()
    await recordAdminAction({
      action: 'user.merged',
      detail: { fromUserId, toUserId },
    })

    return { notice: 'merged', values: { toUserId: String(toUserId) } }
  } catch (err) {
    return toFormState(err)
  }
}

export async function pruneMembersAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const before = new Date(text(form, 'before'))
    if (Number.isNaN(before.getTime())) {
      throw new ValidationError('Choose the date members must have registered before.')
    }

    const inactiveRaw = text(form, 'inactive')
    const inactive = inactiveRaw === '' ? undefined : new Date(inactiveRaw)
    if (inactive !== undefined && Number.isNaN(inactive.getTime())) {
      throw new ValidationError('That inactivity date is not a date.')
    }

    const chunk = await requireUserBulk().pruneChunk(
      {
        registeredBefore: before,
        ...(inactive === undefined ? {} : { inactiveSince: inactive }),
        ...(form.get('awaiting') === null ? {} : { onlyAwaitingActivation: true }),
      },
      PRUNE_CHUNK,
    )

    await invalidatePermissions()
    await recordAdminAction({
      action: 'user.pruned',
      detail: { pruned: chunk.pruned, remaining: chunk.remaining },
    })

    return {
      notice: chunk.remaining > 0 ? 'more' : 'finished',
      values: { pruned: String(chunk.pruned), remaining: String(chunk.remaining) },
    }
  } catch (err) {
    return toFormState(err)
  }
}

export async function startMassMailAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const context = await requireFreshAdmin()

    const groupRaw = text(form, 'targetGroupId')
    const targetGroupId = groupRaw === '' ? null : Number(groupRaw)
    if (targetGroupId !== null && (!Number.isSafeInteger(targetGroupId) || targetGroupId <= 0)) {
      throw new ValidationError('No such group.')
    }

    const bulk = requireUserBulk()
    const massMailId = await bulk.createMassMail({
      subject: text(form, 'subject'),
      body: text(form, 'body'),
      targetGroupId,
      createdByUserId: context.session.userId,
    })

    await recordAdminAction({
      action: 'user.mass_mail_started',
      detail: { massMailId, targetGroupId },
    })

    return queueMassMailBatch(bulk, massMailId)
  } catch (err) {
    return toFormState(err)
  }
}

export async function continueMassMailAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const massMailId = Number(text(form, 'massMailId'))
    if (!Number.isSafeInteger(massMailId) || massMailId <= 0) {
      throw new ValidationError('No such message.')
    }

    return queueMassMailBatch(requireUserBulk(), massMailId)
  } catch (err) {
    return toFormState(err)
  }
}

async function queueMassMailBatch(
  bulk: ReturnType<typeof requireUserBulk>,
  massMailId: number,
): Promise<FormState> {
  const chunk = await bulk.claimMassMailChunk(massMailId, MASS_MAIL_CHUNK)

  for (const recipient of chunk.recipients) {
    await drivers().queue.enqueue(
      'admin.mass_mail',
      { massMailId, userId: recipient.userId, email: recipient.email },
      { dedupeKey: `mass-mail:${massMailId}:${recipient.userId}` },
    )
  }

  const total = (await bulk.readMassMail(massMailId))?.queuedCount ?? 0

  return {
    notice: chunk.finished ? 'sent' : 'more',
    values: { massMailId: String(massMailId), queued: String(total) },
  }
}

export async function liftBanAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const id = userId(form)

    await banService().lift(id)

    await invalidatePermissions()
    await recordAdminAction({ action: 'user.ban_lifted', detail: { userId: id } })

    return { notice: 'lifted' }
  } catch (err) {
    return toFormState(err)
  }
}
