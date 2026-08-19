'use server'

import { revalidatePath } from 'next/cache'

import { ValidationError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { recordStaffAuthEvent } from './auth-events'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { assertDemoAccountChangeable, assertDemoIdentityUnchanged } from './demo'
import { formStateReporter } from './form-state-reporter'
import { trimmedText } from './form-values'
import { getTranslator } from './i18n'
import { emitEvent } from './plugin-view'
import { clearMemberSecondFactor } from './two-factor'
import { banService, requireUserAdmin, requireUserBulk, requireUserMerge } from './user-admin'
import { sendEmailChangeNotice } from './usercp-mail'

const MERGE_CHUNK = 500

const PRUNE_CHUNK = 500

const MASS_MAIL_CHUNK = 500

function userId(form: FormData): number {
  const id = Number(trimmedText(form, 'userId'))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(msg('error.app.such-member'))
  return id
}

const toFormState = formStateReporter('user-admin', 'user administration write failed')

function refreshMemberScreens(): void {
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

    const primaryGroupId = Number(trimmedText(form, 'primaryGroupId'))
    if (!Number.isSafeInteger(primaryGroupId) || primaryGroupId <= 0) {
      throw new ValidationError(msg('error.app.such-group'))
    }

    const displayRaw = trimmedText(form, 'displayGroupId')
    const displayGroupId = displayRaw === '' ? null : Number(displayRaw)
    if (displayGroupId !== null && (!Number.isSafeInteger(displayGroupId) || displayGroupId <= 0)) {
      throw new ValidationError(msg('error.app.such-display-group'))
    }

    const username = trimmedText(form, 'username')
    const email = trimmedText(form, 'email')
    await assertDemoIdentityUnchanged(id, { username, email })

    const before = await getContainer().accountStore.accounts.findById(id)

    await requireUserAdmin().updateAccount(id, {
      username,
      email,
      primaryGroupId,
      displayGroupId,
    })

    refreshMemberScreens()
    await recordAdminAction({ action: 'user.account_changed', detail: { userId: id } })

    if (before !== null && before.email !== email) {
      await sendEmailChangeNotice({
        stage: 'adopted',
        previousEmail: before.email,
        email,
        t: await getTranslator(),
      })
      await recordStaffAuthEvent({ userId: id, kind: 'email_changed' })
    }

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function clearSecondFactorAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const id = userId(form)

    await assertDemoAccountChangeable(id, 'sign-in method')

    const cleared = await clearMemberSecondFactor(id)
    if (!cleared) return { notice: 'cleared' }

    await getContainer().accountStore.sessions.revokeAllForUser(id)

    refreshMemberScreens()
    await recordAdminAction({ action: 'user.second_factor_cleared', detail: { userId: id } })
    await recordStaffAuthEvent({ userId: id, kind: 'second_factor_cleared' })

    return { notice: 'cleared' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function setMemberStateAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const id = userId(form)

    const state = trimmedText(form, 'state')
    if (state !== 'active' && state !== 'awaiting_activation') {
      throw new ValidationError(msg('error.app.choose-active-awaiting-activation'))
    }

    await requireUserAdmin().setState(id, state)

    refreshMemberScreens()
    await recordAdminAction({ action: 'user.state_changed', detail: { userId: id, state } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function banMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const context = await requireFreshAdmin()
    const id = userId(form)

    const days = trimmedText(form, 'days')
    let expiresAt: Date | undefined
    if (days !== '') {
      const parsed = Number(days)
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new ValidationError(msg('error.app.ban-lasts-whole-number-days'))
      }
      expiresAt = new Date(Date.now() + parsed * 86_400_000)
    }

    await banService().ban({
      userId: id,
      bannedByUserId: context.session.userId,
      ...(trimmedText(form, 'reason') === '' ? {} : { reason: trimmedText(form, 'reason') }),
      ...(trimmedText(form, 'publicReason') === ''
        ? {}
        : { publicReason: trimmedText(form, 'publicReason') }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    })

    await emitEvent(
      'user.banned',
      { userId: id, expiresAt: expiresAt?.toISOString() ?? null },
      { moderatorId: context.session.userId, reason: trimmedText(form, 'reason') || null },
    )

    refreshMemberScreens()
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
        throw new ValidationError(msg('error.app.such-group'))
      }
      groupIds.push(parsed)
    }

    await requireUserAdmin().setSecondaryGroups(id, groupIds, context.session.userId)

    await emitEvent(
      'user.groups.changed',
      { userId: id, primaryGroupId: 0, secondaryGroupIds: groupIds },
      { requestId: currentRequestId() ?? null },
    )

    refreshMemberScreens()
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
    const toUserId = Number(trimmedText(form, 'toUserId'))
    if (!Number.isSafeInteger(toUserId) || toUserId <= 0) {
      throw new ValidationError(msg('error.app.choose-account-merge-into'))
    }
    if (fromUserId === toUserId) {
      throw new ValidationError(msg('error.app.choose-two-different-accounts'))
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

    await emitEvent(
      'user.merged',
      { keptUserId: toUserId, mergedUserId: fromUserId },
      { requestId: currentRequestId() ?? null },
    )

    refreshMemberScreens()
    await recordAdminAction({
      action: 'user.merged',
      detail: { fromUserId, toUserId },
    })

    return { notice: 'merged', values: { toUserId: String(toUserId) } }
  } catch (err) {
    return toFormState(err)
  }
}

export async function pruneMembersAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const before = new Date(trimmedText(form, 'before'))
    if (Number.isNaN(before.getTime())) {
      throw new ValidationError(msg('error.app.choose-date-members-must-registered'))
    }

    const inactiveRaw = trimmedText(form, 'inactive')
    const inactive = inactiveRaw === '' ? undefined : new Date(inactiveRaw)
    if (inactive !== undefined && Number.isNaN(inactive.getTime())) {
      throw new ValidationError(msg('error.app.inactivity-date-date'))
    }

    const chunk = await requireUserBulk().pruneChunk(
      {
        registeredBefore: before,
        ...(inactive === undefined ? {} : { inactiveSince: inactive }),
        ...(form.get('awaiting') === null ? {} : { onlyAwaitingActivation: true }),
      },
      PRUNE_CHUNK,
    )

    for (const prunedUserId of chunk.prunedUserIds) {
      await emitEvent(
        'user.deleted',
        { userId: prunedUserId, reason: 'pruned' },
        { requestId: currentRequestId() ?? null },
      )
    }

    refreshMemberScreens()
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

export async function startMassMailAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const context = await requireFreshAdmin()

    const groupRaw = trimmedText(form, 'targetGroupId')
    const targetGroupId = groupRaw === '' ? null : Number(groupRaw)
    if (targetGroupId !== null && (!Number.isSafeInteger(targetGroupId) || targetGroupId <= 0)) {
      throw new ValidationError(msg('error.app.such-group'))
    }

    const bulk = requireUserBulk()
    const massMailId = await bulk.createMassMail({
      subject: trimmedText(form, 'subject'),
      body: trimmedText(form, 'body'),
      targetGroupId,
      createdByUserId: context.session.userId,
    })

    await recordAdminAction({
      action: 'user.mass_mail_started',
      detail: { massMailId, targetGroupId },
    })

    return (await queueMassMailBatch(bulk, massMailId)).state
  } catch (err) {
    return toFormState(err)
  }
}

export async function continueMassMailAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const massMailId = Number(trimmedText(form, 'massMailId'))
    if (!Number.isSafeInteger(massMailId) || massMailId <= 0) {
      throw new ValidationError(msg('error.app.such-message'))
    }

    const batch = await queueMassMailBatch(requireUserBulk(), massMailId)
    await recordAdminAction({
      action: 'user.mass_mail_continued',
      detail: { massMailId, sent: batch.sent, queued: batch.queued },
    })

    return batch.state
  } catch (err) {
    return toFormState(err)
  }
}

async function queueMassMailBatch(
  bulk: ReturnType<typeof requireUserBulk>,
  massMailId: number,
): Promise<{ state: FormState; sent: number; queued: number }> {
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
    state: {
      notice: chunk.finished ? 'sent' : 'more',
      values: { massMailId: String(massMailId), queued: String(total) },
    },
    sent: chunk.recipients.length,
    queued: total,
  }
}

export async function liftBanAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const context = await requireAdmin()
    const id = userId(form)

    await banService().lift(id)

    await emitEvent(
      'user.unbanned',
      { userId: id, expired: false },
      { moderatorId: context.session.userId, reason: null },
    )

    refreshMemberScreens()
    await recordAdminAction({ action: 'user.ban_lifted', detail: { userId: id } })

    return { notice: 'lifted' }
  } catch (err) {
    return toFormState(err)
  }
}
