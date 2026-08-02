'use server'

/**
 * F67 — the user administration writes.
 *
 * Each re-authorises for itself, as every Server Action in the panel does.
 *
 * Each also invalidates the permission version, because everything editable
 * here is a permission input: which group a member is in, whether their account
 * is active, and whether they are banned all decide what F20 resolves. The
 * repository bumps the number inside the write's own transaction; this clears
 * the tag so the caches holding the old number let go.
 *
 * **Banning goes through `BanService`, never through the state column.** F23
 * captures the group the member held at ban time and restores it on expiry, so
 * a ban written as a state change produces a member who cannot be un-banned
 * correctly — the column says banned and no ban row exists to expire.
 */
import { CacheTags, ValidationError, isAppError, logger } from '@forum/core'
import { drivers } from '@forum/drivers'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { banService, requireUserAdmin, requireUserBulk, requireUserMerge } from './user-admin'
import type { FormState } from './auth-form-state'

/** Posts moved per press of the merge button. */
const MERGE_CHUNK = 500

/** Accounts closed per press of the prune button. */
const PRUNE_CHUNK = 500

/** Recipients queued per press of the mass-mail button. */
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

    await requireUserAdmin().updateAccount(id, {
      username: text(form, 'username'),
      email: text(form, 'email'),
      primaryGroupId,
      displayGroupId,
    })

    await invalidatePermissions()
    /*
     * The member, never the values. An email address is the member's, and the
     * admin log is read by more people than can edit an account — the same rule
     * F64 applies to setting values.
     */
    await recordAdminAction({ action: 'user.account_changed', detail: { userId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Activate a member, or put them back to awaiting activation.
 *
 * `banned` is not reachable from here — the repository refuses it, and this
 * refuses it too rather than relying on that, because the two guards protect
 * different things: one keeps the column honest, this one keeps the *screen*
 * from offering an operation that would look like a ban and not be one.
 */
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

/**
 * Ban a member.
 *
 * **Re-authenticated.** It revokes their sessions, moves their group and locks
 * them out; there is no undo beyond lifting it, and the person it is done to
 * finds out immediately.
 *
 * Two reasons, deliberately. `reason` is staff-facing and routinely says things
 * ("linked to the account we banned last week") that must never be handed to
 * the person it is about; `publicReason` is what F23 shows them on the login
 * attempt. Collapsing them into one field is how the internal note ends up on
 * the screen.
 */
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
      /* How long, but never why: the reason is the staff note. */
      detail: { userId: id, days: days === '' ? null : Number(days) },
    })

    return { notice: 'banned' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Replace a member's additional groups.
 *
 * `user_group_memberships` has been read since F20 — `actor-builder` folds it
 * into `Actor.groupIds`, so a secondary group grants exactly as the primary one
 * does under R4.2 — and until this action it had **no writer anywhere**. A
 * board could resolve secondary groups and had no way to grant one.
 *
 * The form submits the whole set, so this replaces rather than adds: an
 * unticked box is a removal, the same rule the group permission editor follows
 * and for the same reason.
 */
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

/**
 * Move one batch of a merge, and finish it when nothing is left.
 *
 * **Re-authenticated.** A merge rewrites the authorship of everything one
 * account ever posted and soft-deletes it; there is no undo at all, and getting
 * the two accounts the wrong way round destroys the one somebody meant to keep.
 *
 * One press per batch, with the state in the form — the same shape as F66's
 * mass membership move, and for the same reason: `posts` is the one table whose
 * size is a function of how old the board is, and a single statement over it
 * holds locks on the table every request reads.
 */
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

/**
 * Prune one batch of dormant accounts.
 *
 * **Re-authenticated**, and the criteria travel in the form rather than being
 * re-read from a URL — the operator confirmed a dry run against *these* dates,
 * and a prune that used anything else would be acting on a preview nobody saw.
 *
 * Closes rather than deletes. A prune run against a wrong date is then
 * recoverable, which a delete of ten thousand rows is not.
 */
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

/**
 * Start a mass mail: create the campaign and queue its first batch.
 *
 * **Re-authenticated.** It is the one operation in the panel whose effect
 * leaves the board entirely — an email cannot be unsent, and a mistake reaches
 * every member at once.
 */
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
      /* The subject, never the body: the log is not the place to keep prose. */
      detail: { massMailId, targetGroupId },
    })

    return queueMassMailBatch(bulk, massMailId)
  } catch (err) {
    return toFormState(err)
  }
}

/** Queue the next batch of an existing campaign. */
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

/**
 * Claim a batch of recipients and enqueue one job each.
 *
 * One job per member rather than one job for the batch: a provider rejecting a
 * single address then costs that member's message a retry rather than the whole
 * batch's, and the queue's own dead-letter list becomes the record of who could
 * not be reached.
 *
 * Nothing is sent here. The driver is touched only inside the tick (F55's
 * rule), because an SMTP provider hanging for ten seconds must not be a
 * ten-second Server Action.
 */
async function queueMassMailBatch(
  bulk: ReturnType<typeof requireUserBulk>,
  massMailId: number,
): Promise<FormState> {
  const chunk = await bulk.claimMassMailChunk(massMailId, MASS_MAIL_CHUNK)

  for (const recipient of chunk.recipients) {
    await drivers().queue.enqueue(
      'admin.mass_mail',
      { massMailId, userId: recipient.userId, email: recipient.email },
      /* One message per member per campaign, whatever the form does. */
      { dedupeKey: `mass-mail:${massMailId}:${recipient.userId}` },
    )
  }

  const total = (await bulk.readMassMail(massMailId))?.queuedCount ?? 0

  return {
    notice: chunk.finished ? 'sent' : 'more',
    values: { massMailId: String(massMailId), queued: String(total) },
  }
}

/**
 * Lift a ban early.
 *
 * Delegates to `BanService.lift`, which restores the *captured* group rather
 * than the default one — the same code path expiry uses, so there is one
 * restore to trust rather than two that could disagree.
 */
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
