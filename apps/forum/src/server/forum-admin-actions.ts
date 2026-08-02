'use server'

/**
 * F65 — the forum administration writes.
 *
 * Every one of them re-authorises for itself: a Server Action is a public
 * endpoint reachable without rendering any page, so the ACP layout having
 * checked is not a check (F63's rule).
 *
 * Every one of them also invalidates the forum tree. `CacheTags.forumTree()`
 * has had `CachedForumRepository` behind it since F16 and, like `invalidates`
 * before F64, **no writer had ever cleared it** — the CLI's `forum:create` runs
 * out of process and cannot. An operator renaming a forum in the panel and
 * seeing the old name would reasonably conclude the save failed.
 */
import { CacheTags, ValidationError, isAppError, logger } from '@forum/core'
import { FORUM_PERMISSION_FIELDS } from '@forum/core'
import { readMatrixCell } from '@forum/authorization'
import { drivers } from '@forum/drivers'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { requireForumAdmin } from './forum-admin'
import type { FormState } from './auth-form-state'

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function checkbox(form: FormData, name: string): boolean {
  return form.get(name) !== null
}

function forumId(form: FormData): number {
  const id = Number(text(form, 'forumId'))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('No such forum.')
  return id
}

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'forum-admin' }).error({ err }, 'forum administration write failed')
  return { error: 'Something went wrong. Please try again.' }
}

/** Everything that changes the tree invalidates the tree. */
async function invalidateTree(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.forumTree()])
}

export async function saveForumOptionsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const repository = requireForumAdmin()

    const title = text(form, 'title')
    const slug = text(form, 'slug')
    if (title === '') throw new ValidationError('A forum needs a title.')
    /*
     * The slug is in every URL this forum will ever have, so it is bounded to
     * what a URL can carry without escaping — a slug that has to be
     * percent-encoded produces links nobody can read or paste.
     */
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      throw new ValidationError(
        'A slug may contain lower-case letters, numbers and single hyphens.',
      )
    }

    const order = Number(text(form, 'displayOrder'))
    if (!Number.isSafeInteger(order) || order < 0) {
      throw new ValidationError('Display order must be a whole number.')
    }

    await repository.updateOptions(id, {
      title,
      slug,
      description: text(form, 'description') === '' ? null : text(form, 'description'),
      linkUrl: text(form, 'linkUrl') === '' ? null : text(form, 'linkUrl'),
      displayOrder: order,
      isOpen: checkbox(form, 'isOpen'),
      allowThreads: checkbox(form, 'allowThreads'),
      allowReplies: checkbox(form, 'allowReplies'),
      allowPolls: checkbox(form, 'allowPolls'),
      allowAttachments: checkbox(form, 'allowAttachments'),
      requiresPrefix: checkbox(form, 'requiresPrefix'),
      moderateNewThreads: checkbox(form, 'moderateNewThreads'),
      moderateNewPosts: checkbox(form, 'moderateNewPosts'),
    })

    await invalidateTree()
    await recordAdminAction({ action: 'forum.options_changed', detail: { forumId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Save one group's row of the matrix.
 *
 * One group per submission, deliberately. A form carrying every group's row
 * would be twenty-odd fields times however many groups a board has, and — worse
 * — a save would rewrite rows the operator had not looked at. Permissions are
 * the thing this panel is most dangerous about; the unit of change is the unit
 * an operator was actually reading.
 */
export async function saveForumPermissionsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const groupId = Number(text(form, 'groupId'))
    if (!Number.isSafeInteger(groupId) || groupId <= 0) {
      throw new ValidationError('No such group.')
    }

    const values: Record<string, boolean | number | null> = {}
    for (const field of FORUM_PERMISSION_FIELDS) {
      const raw = form.get(field.key)
      /*
       * Every field is read, present or not. A three-state control always
       * submits something, so an absent field is a form that was not this
       * screen's — and reading only what arrived would leave the missing cells
       * at whatever a previous save happened to write.
       */
      values[field.key] = readMatrixCell(field, typeof raw === 'string' ? raw : undefined)
    }

    await requireForumAdmin().saveOverrides(id, groupId, values)

    /*
     * The permission version, not the forum tree: resolved actors carry a
     * version and F20's scheme invalidates them en masse when a permission
     * input changes. A rename is a tree change; this is not.
     */
    await drivers().cache.invalidateTags([CacheTags.permissions()])
    await recordAdminAction({
      action: 'forum.permissions_changed',
      detail: { forumId: id, groupId },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Copy this forum's overrides to every forum beneath it.
 *
 * **Re-authenticated first.** This is the one operation in the panel that
 * silently rewrites forums the operator is not looking at, across a subtree of
 * any size, with no undo — which is exactly what F63 built `requireFreshAdmin`
 * for. The screen previews it; this makes sure the person pressing the button
 * is still the person who signed in.
 */
export async function copyForumPermissionsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const id = forumId(form)
    const repository = requireForumAdmin()

    const descendants = await repository.descendantIds(id)
    if (descendants.length === 0) {
      throw new ValidationError('This forum has nothing beneath it.')
    }

    const groups = (await repository.listGroups()).map((group) => group.id)
    await repository.copyToDescendants(id, descendants, groups)

    await drivers().cache.invalidateTags([CacheTags.permissions()])
    await recordAdminAction({
      action: 'forum.permissions_copied',
      /* How far it reached is the number somebody asks about afterwards. */
      detail: { forumId: id, forums: descendants.length },
    })

    return { notice: 'copied' }
  } catch (err) {
    return toFormState(err)
  }
}
