'use server'

/**
 * F66 — the group administration writes.
 *
 * Like F65's, each one re-authorises for itself: a Server Action is a public
 * endpoint reachable without rendering any page, so the ACP layout having
 * checked is not a check.
 *
 * Unlike F65's, none of them needs to invalidate the forum tree and **all of
 * them invalidate the permission version**, because a group is nothing but
 * permissions: its defaults are R4.1 layer 1, its membership decides whose
 * defaults those are, and F20 caches a resolved Actor against that version. The
 * repository bumps the number inside the same transaction as the write; this
 * clears the tag that makes the caches holding the old number let go.
 */
import { CacheTags, PERMISSION_FIELDS, ValidationError, isAppError, logger } from '@meith/core'
import { drivers } from '@meith/drivers'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { promotionService, requireGroupAdmin } from './group-admin'
import type { FormState } from './auth-form-state'

/** How many members one press of the button moves. */
const CHUNK = 500

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function checkbox(form: FormData, name: string): boolean {
  return form.get(name) !== null
}

function groupId(form: FormData, name = 'groupId'): number {
  const id = Number(text(form, name))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('No such group.')
  return id
}

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'group-admin' }).error({ err }, 'group administration write failed')
  return { error: 'Something went wrong. Please try again.' }
}

/** Every write here changes what somebody is allowed to do. */
async function invalidatePermissions(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.permissions()])
}

export async function saveGroupIdentityAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = groupId(form)

    const title = text(form, 'title')
    if (title === '') throw new ValidationError('A group needs a title.')

    const order = Number(text(form, 'displayOrder'))
    if (!Number.isSafeInteger(order) || order < 0) {
      throw new ValidationError('Display order must be a whole number.')
    }

    await requireGroupAdmin().updateIdentity(id, {
      title,
      description: text(form, 'description') === '' ? null : text(form, 'description'),
      displayOrder: order,
      isStaffGroup: checkbox(form, 'isStaffGroup'),
      badgeToken: text(form, 'badgeToken') === '' ? null : text(form, 'badgeToken'),
    })

    /*
     * A rename is not a permission change, but the badge and the staff flag are
     * carried on the same resolved actor — so this invalidates too, rather than
     * making a judgement about which columns matter.
     */
    await invalidatePermissions()
    await recordAdminAction({ action: 'group.updated', detail: { groupId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Save a group's global permissions.
 *
 * **Two states per cell, not three.** F65's forum cells are three because
 * `forum_permissions` is nullable and null means inherit; a group's defaults
 * are the bottom of the resolution and have nothing above them to inherit from,
 * so every cell has an answer and reusing the three-state control out of
 * symmetry would invent an "inherit" that means nothing.
 *
 * Every field is read whether it arrived or not — an unchecked checkbox submits
 * nothing, and treating absent as "leave alone" would make it impossible to
 * revoke anything.
 */
export async function saveGroupPermissionsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = groupId(form)

    const values: Record<string, boolean | number> = {}
    for (const field of PERMISSION_FIELDS) {
      if (field.kind === 'numeric') {
        const raw = text(form, field.key)
        const parsed = Number(raw)
        if (raw !== '' && (!Number.isSafeInteger(parsed) || parsed < 0)) {
          throw new ValidationError(`“${field.key}” must be a whole number, or blank for none.`)
        }
        values[field.key] = raw === '' ? field.fallback : parsed
      } else {
        values[field.key] = checkbox(form, field.key)
      }
    }

    await requireGroupAdmin().savePermissions(id, values)

    await invalidatePermissions()
    await recordAdminAction({ action: 'group.permissions_changed', detail: { groupId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Create a group by copying another.
 *
 * The copy source is required, not optional. The registry defaults are
 * deny-everything, so a group created from them is one whose members cannot see
 * the board — and an operator who then reports "the new group is broken" is
 * describing the screen's fault, not theirs.
 */
export async function createGroupAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const key = text(form, 'key')
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new ValidationError(
        'A key may contain lower-case letters, numbers and underscores, and must start with a letter.',
      )
    }

    const title = text(form, 'title')
    if (title === '') throw new ValidationError('A group needs a title.')

    const id = await requireGroupAdmin().create({
      key,
      title,
      copyFromGroupId: groupId(form, 'copyFromGroupId'),
    })

    await invalidatePermissions()
    await recordAdminAction({ action: 'group.created', detail: { groupId: id, key } })

    return { notice: 'created' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Delete a group, moving its members somewhere.
 *
 * **Re-authenticated.** It changes the primary group of every member it holds,
 * with no undo, and a group is a permission set — deleting the wrong one hands
 * a population of members whatever the destination allows. The repository
 * refuses system groups; this asks who is pressing the button.
 */
export async function deleteGroupAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const id = groupId(form)
    const moveTo = groupId(form, 'moveMembersTo')

    await requireGroupAdmin().remove(id, moveTo)

    await invalidatePermissions()
    await recordAdminAction({
      action: 'group.deleted',
      detail: { groupId: id, movedTo: moveTo },
    })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Move one chunk of a group's members into another group.
 *
 * One chunk per submission, with the cursor carried in the form. A single
 * button that moved every member would hold row locks on `users` — the table
 * every request reads — for as long as it took, on a board where "every member"
 * can be five figures. Chunking makes the run interruptible and resumable, and
 * putting the cursor in the form is what makes it resumable *without JavaScript*
 * (D06): the next press continues where this one stopped.
 *
 * **Re-authenticated**, like the delete: it is a bulk privilege change with no
 * undo. The freshness window means an operator confirms once and can then work
 * through a long run without retyping their password on every press.
 */
export async function moveMembersAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const from = groupId(form, 'fromGroupId')
    const to = groupId(form, 'toGroupId')

    const after = Number(text(form, 'afterUserId') || '0')
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new ValidationError('Lost track of where the run had got to. Start again.')
    }

    const chunk = await requireGroupAdmin().moveMembersChunk({
      fromGroupId: from,
      toGroupId: to,
      afterUserId: after,
      limit: CHUNK,
    })

    await invalidatePermissions()
    await recordAdminAction({
      action: 'group.members_moved',
      detail: { fromGroupId: from, toGroupId: to, moved: chunk.moved },
    })

    /*
     * The cursor goes back into the form, and `moved` is a running total so a
     * multi-press run can say what it has done rather than only what the last
     * press did.
     */
    const total = Number(text(form, 'movedSoFar') || '0') + chunk.moved

    return {
      notice: chunk.nextCursor === null ? 'finished' : 'more',
      values: {
        fromGroupId: String(from),
        toGroupId: String(to),
        afterUserId: String(chunk.nextCursor ?? 0),
        movedSoFar: String(total),
      },
    }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Run the promotion rules for real.
 *
 * The screen shows `preview()` first and this calls `apply()` — the same
 * evaluation, differing only in whether the outcomes are written, which is what
 * stops a preview from ever disagreeing with the run it previewed.
 *
 * **Re-authenticated.** It moves members between groups in bulk on criteria
 * somebody configured earlier, which is the definition of an action whose blast
 * radius is not visible from the button.
 */
export async function applyPromotionsAction(
  _prev: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const result = await promotionService().apply()

    await invalidatePermissions()
    await recordAdminAction({
      action: 'group.promotions_applied',
      detail: { promoted: result.outcomes.length, examined: result.examined },
    })

    return { notice: `promoted:${result.outcomes.length}` }
  } catch (err) {
    return toFormState(err)
  }
}
