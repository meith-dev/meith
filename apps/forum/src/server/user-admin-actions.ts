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
import { banService, requireUserAdmin, requireUserMerge } from './user-admin'
import type { FormState } from './auth-form-state'

/** Posts moved per press of the merge button. */
const MERGE_CHUNK = 500

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
