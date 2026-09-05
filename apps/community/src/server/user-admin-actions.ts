'use server'

import { refresh, revalidatePath } from 'next/cache'

import { ValidationError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { claimAdminUndo, issueAdminUndo } from './admin-undo'
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

const USER_BULK_LIMIT = 500

function userId(form: FormData): number {
  const id = Number(trimmedText(form, 'userId'))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(msg('error.app.such-member'))
  return id
}

const toFormState = formStateReporter('user-admin', 'user administration write failed')

function refreshMemberScreens(): void {
  revalidatePath('/admin/users')
  revalidatePath('/admin/users/[id]', 'page')
  refresh()
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
    const context = await requireAdmin()
    const id = userId(form)

    const state = trimmedText(form, 'state')
    if (state !== 'active' && state !== 'awaiting_activation') {
      throw new ValidationError(msg('error.app.choose-active-awaiting-activation'))
    }

    const repository = requireUserAdmin()
    const before =
      getContainer().dataSource === 'postgres' ? await repository.readDetail(id) : undefined
    if (before === null) throw new ValidationError(msg('error.app.such-member'))
    await repository.setState(id, state)

    refreshMemberScreens()
    await recordAdminAction({ action: 'user.state_changed', detail: { userId: id, state } })

    return {
      notice: 'saved',
      undo:
        before === undefined
          ? undefined
          : await issueAdminUndo({
              actorUserId: context.session.userId,
              operation: 'user.state',
              snapshot: { userId: id, state: before.state },
            }),
    }
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

    refreshMemberScreens()

    const [, undo] = await Promise.all([
      emitEvent(
        'user.banned',
        { userId: id, expiresAt: expiresAt?.toISOString() ?? null },
        { moderatorId: context.session.userId, reason: trimmedText(form, 'reason') || null },
      ),
      issueAdminUndo({
        actorUserId: context.session.userId,
        operation: 'user.ban',
        snapshot: { userId: id },
      }),
      recordAdminAction({
        action: 'user.banned',
        detail: { userId: id, days: days === '' ? null : Number(days) },
      }),
    ])

    return { notice: 'banned', undo }
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

    const repository = requireUserAdmin()
    const before =
      getContainer().dataSource === 'postgres'
        ? await repository.readSecondaryGroups(id)
        : undefined
    await repository.setSecondaryGroups(id, groupIds, context.session.userId)

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

    return {
      notice: 'saved',
      undo:
        before === undefined
          ? undefined
          : await issueAdminUndo({
              actorUserId: context.session.userId,
              operation: 'user.groups',
              snapshot: { userId: id, memberships: before },
            }),
    }
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

export async function pruneSelectedMembersAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const context = await requireFreshAdmin()
    const selection = await claimAdminUndo({
      token: trimmedText(form, 'selection'),
      actorUserId: context.session.userId,
    })
    if (selection.operation !== 'user.prune_selection') {
      throw new ValidationError(msg('admin.undoInvalid'))
    }
    const values = selection.snapshot.userIds
    if (!Array.isArray(values)) throw new ValidationError(msg('admin.undoInvalid'))
    const ids = values.map((value) => Number(value))
    if (
      ids.length === 0 ||
      ids.length > USER_BULK_LIMIT ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new ValidationError(msg('admin.undoInvalid'))
    }

    const prunedUserIds = await requireUserBulk().pruneSelected(ids)
    for (const prunedUserId of prunedUserIds) {
      await emitEvent(
        'user.deleted',
        { userId: prunedUserId, reason: 'pruned' },
        { requestId: currentRequestId() ?? null },
      )
    }
    refreshMemberScreens()
    await recordAdminAction({
      action: 'user.pruned_selected',
      detail: { selected: ids.length, pruned: prunedUserIds.length },
    })
    return { notice: 'finished', values: { pruned: String(prunedUserIds.length) } }
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
  const chunk = await bulk.claimMassMailChunk(massMailId, MASS_MAIL_CHUNK, async (recipients) => {
    for (const recipient of recipients) {
      await drivers().queue.enqueue(
        'admin.mass_mail',
        { massMailId, userId: recipient.userId, email: recipient.email },
        { dedupeKey: `mass-mail:${massMailId}:${recipient.userId}` },
      )
    }
  })

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

export async function bulkUserAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const context = await requireFreshAdmin()
    const ids = [...new Set(form.getAll('userIds').map((value) => Number(value)))]
    if (
      ids.length === 0 ||
      ids.length > USER_BULK_LIMIT ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new ValidationError(msg('adminUsers.bulkInvalid'))
    }
    if (ids.includes(context.session.userId)) throw new ValidationError(msg('adminUsers.bulkSelf'))

    const repository = requireUserAdmin()
    const members = await Promise.all(ids.map((id) => repository.readDetail(id)))
    if (members.some((member) => member === null || member.deletedAt !== null)) {
      throw new ValidationError(msg('adminUsers.bulkStale'))
    }

    const kind = trimmedText(form, 'bulkAction')
    if (kind === 'ban') {
      const reason = trimmedText(form, 'reason')
      const banned: number[] = []
      for (const id of ids) {
        await banService().ban({
          userId: id,
          bannedByUserId: context.session.userId,
          ...(reason === '' ? {} : { reason }),
        })
        banned.push(id)
      }
      refreshMemberScreens()
      await recordAdminAction({ action: 'user.bulk_banned', detail: { count: banned.length } })
      return {
        notice: 'bulk-banned',
        undo: await issueAdminUndo({
          actorUserId: context.session.userId,
          operation: 'user.bulk_ban',
          snapshot: { userIds: banned },
        }),
      }
    }

    if (kind === 'group') {
      const groupId = Number(trimmedText(form, 'groupId'))
      if (!Number.isSafeInteger(groupId) || groupId <= 0) {
        throw new ValidationError(msg('error.app.such-group'))
      }
      for (const id of ids) {
        const before = await repository.readSecondaryGroups(id)
        await repository.setSecondaryGroups(
          id,
          [...new Set([...before, groupId])],
          context.session.userId,
        )
      }
      refreshMemberScreens()
      await recordAdminAction({ action: 'user.bulk_groups_changed', detail: { count: ids.length } })
      return { notice: 'bulk-grouped' }
    }

    if (kind === 'prune') {
      const selection = await issueAdminUndo({
        actorUserId: context.session.userId,
        operation: 'user.prune_selection',
        snapshot: { userIds: ids },
      })
      if (selection === undefined) throw new ValidationError(msg('admin.undoUnavailable'))
      return {
        notice: 'prune-selection',
        values: { selection: selection.token },
      }
    }

    throw new ValidationError(msg('adminUsers.bulkChoose'))
  } catch (err) {
    return toFormState(err)
  }
}

export async function liftBanAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const context = await requireAdmin()
    const id = userId(form)

    await banService().lift(id)

    refreshMemberScreens()

    await Promise.all([
      emitEvent(
        'user.unbanned',
        { userId: id, expired: false },
        { moderatorId: context.session.userId, reason: null },
      ),
      recordAdminAction({ action: 'user.ban_lifted', detail: { userId: id } }),
    ])

    return { notice: 'lifted' }
  } catch (err) {
    return toFormState(err)
  }
}
