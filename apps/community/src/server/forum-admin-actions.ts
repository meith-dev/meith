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
import { revalidatePath } from 'next/cache'

import { CacheTags, ValidationError, isAppError, logger } from '@meith/core'
import { FORUM_PERMISSION_FIELDS } from '@meith/core'
import { readMatrixCell } from '@meith/authorization'
import { drivers } from '@meith/drivers'

import { MODERATOR_RIGHTS } from '@meith/db'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { getContainer } from './container'
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

/**
 * Everything that changes the tree invalidates the tree.
 *
 * **Two caches, and forgetting the second one is invisible with scripting off.**
 * `drivers().cache` is the board's own store, and clearing it is what makes the
 * next *server* render correct. It says nothing about Next's client Router
 * Cache, which holds the RSC payload for the page the action was posted from —
 * so until the 7 August 2026 audit, creating a forum returned its success
 * notice and left the tree listing the forums that existed a moment ago. The
 * row appeared on the next full navigation, by which time the operator had
 * usually created it twice. With JavaScript off the browser's own reload hid
 * the bug entirely, which is why nothing caught it.
 *
 * `revalidatePath` on the two named routes rather than the `('/', 'layout')`
 * sweep `redirect-back.ts` warns about: that one purges cached data for every
 * route under `/` — the whole board's settings and forum tree, for everybody —
 * to refresh one list. These are the pages that render the tree, and they are
 * the pages that go stale.
 */
async function invalidateTree(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.forumTree()])
  revalidatePath('/admin/forums')
  revalidatePath('/admin/forums/[id]', 'page')
}

/**
 * The permission version, and the two screens that read a forum's own rules.
 *
 * Same argument as `invalidateTree` above, applied to the half of this file that
 * was left out of it. A moderator appointment and a permission row are read by
 * `/admin/forums/[id]` and `/admin/forums/[id]/permissions`, and neither was
 * refreshed — so with JavaScript on, appointing somebody returned "Saved." above
 * a list that still said *"Nobody moderates this forum"*, and removing an
 * appointment left the person listed. An operator revoking moderation from
 * somebody is doing it for a reason, and a screen that still shows them in place
 * is the last thing that should be shown.
 */
async function invalidateForumPermissions(): Promise<void> {
  /*
   * Resolved actors carry a permission version and F20's scheme invalidates them
   * en masse when a permission input changes. A rename is a tree change; this is
   * not.
   */
  await drivers().cache.invalidateTags([CacheTags.permissions()])
  revalidatePath('/admin/forums/[id]', 'page')
  revalidatePath('/admin/forums/[id]/permissions', 'page')
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

    /* Not the forum tree — see `invalidateForumPermissions`. */
    await invalidateForumPermissions()
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

    await invalidateForumPermissions()
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


/* ------------------------------------------------------------------ *
 * Creating and moving
 * ------------------------------------------------------------------ */

/**
 * Create a category, forum or link.
 *
 * Delegates to F16's `create`, which takes the forest lock and re-reads the
 * tree inside its transaction — planning a position against a stale snapshot is
 * how two concurrent creates end up with the same display order.
 */
export async function createForumAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const { forums } = getContainer()

    const type = text(form, 'type')
    if (type !== 'category' && type !== 'forum' && type !== 'link') {
      throw new ValidationError('Choose a category, a forum or a link.')
    }

    const title = text(form, 'title')
    const slug = text(form, 'slug')
    if (title === '') throw new ValidationError('A forum needs a title.')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      throw new ValidationError(
        'A slug may contain lower-case letters, numbers and single hyphens.',
      )
    }

    const parent = text(form, 'parentId')
    const parentId = parent === '' ? null : Number(parent)
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) {
      throw new ValidationError('No such parent forum.')
    }

    await forums.create({
      type,
      title,
      slug,
      /* `NewForum` takes `undefined` for absent, not `null`. */
      ...(text(form, 'description') === ''
        ? {}
        : { description: text(form, 'description') }),
      parentId,
      ...(text(form, 'linkUrl') === '' ? {} : { linkUrl: text(form, 'linkUrl') }),
    })

    await invalidateTree()
    await recordAdminAction({ action: 'forum.created', detail: { slug, type } })

    return { notice: 'created' }
  } catch (err) {
    return toFormState(err)
  }
}

/**
 * Move a forum, taking its subtree with it.
 *
 * **Re-authenticated**, like the permission copy, and for the same reason: it
 * rewrites the path of every descendant in one transaction, changes which
 * permissions they inherit, and there is no undo. Moving a busy forum under a
 * private category makes its whole subtree invisible, which is a large effect
 * from one dropdown.
 *
 * The cycle check is F16's and lives inside `move` — it re-reads the tree under
 * the forest lock, because planning against a caller's stale copy is how a
 * concurrent move slips a cycle past validation.
 */
export async function moveForumAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const id = forumId(form)

    const parent = text(form, 'newParentId')
    const newParentId = parent === '' ? null : Number(parent)
    if (newParentId !== null && (!Number.isSafeInteger(newParentId) || newParentId <= 0)) {
      throw new ValidationError('No such parent forum.')
    }
    if (newParentId === id) {
      throw new ValidationError('A forum cannot be its own parent.')
    }

    await getContainer().forums.move(id, { newParentId })

    await invalidateTree()
    /*
     * A move changes what every descendant inherits, so resolved actors have to
     * go too — the permission version, not only the tree.
     */
    await invalidateForumPermissions()
    await recordAdminAction({
      action: 'forum.moved',
      detail: { forumId: id, newParentId },
    })

    return { notice: 'moved' }
  } catch (err) {
    return toFormState(err)
  }
}

/* ------------------------------------------------------------------ *
 * Moderator appointments
 * ------------------------------------------------------------------ */

/**
 * Appoint a member or a group, or change what an existing appointment allows.
 *
 * `forum_moderators` has had a reader since F48 — appointments resolve into
 * `Target.isForumModerator` and carry granular rights — and until now no writer
 * at all, so "moderator" could only be configured with SQL.
 *
 * Gated on `requireAdmin` rather than on `user.warn` or a moderator permission:
 * appointing moderators is how somebody grants moderation, and a moderator who
 * could appoint moderators could grant themselves anything F48 resolves.
 */
export async function appointModeratorAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const repository = requireForumAdmin()

    const username = text(form, 'username')
    const groupRaw = text(form, 'groupId')

    /*
     * Exactly one. The table permits both columns to be set and F48 would
     * resolve such a row as two appointments that cannot be edited apart, so
     * the screen offers one field or the other and this enforces it.
     */
    if ((username === '') === (groupRaw === '')) {
      throw new ValidationError('Name a member or choose a group, not both.')
    }

    let userId: number | null = null
    let groupId: number | null = null

    if (username !== '') {
      const member = await repository.findMemberByUsername(username)
      if (member === null) throw new ValidationError(`No member called “${username}”.`)
      userId = member.id
    } else {
      groupId = Number(groupRaw)
      if (!Number.isSafeInteger(groupId) || groupId <= 0) {
        throw new ValidationError('No such group.')
      }
    }

    const rights = Object.fromEntries(
      MODERATOR_RIGHTS.map((right) => [right, checkbox(form, right)]),
    ) as Record<(typeof MODERATOR_RIGHTS)[number], boolean>

    await repository.appoint({
      forumId: id,
      userId,
      groupId,
      cascadeToSubforums: checkbox(form, 'cascadeToSubforums'),
      rights,
    })

    await invalidateForumPermissions()
    await recordAdminAction({
      action: 'forum.moderator_appointed',
      detail: { forumId: id, userId, groupId },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function removeModeratorAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const appointmentId = Number(text(form, 'appointmentId'))
    if (!Number.isSafeInteger(appointmentId) || appointmentId <= 0) {
      throw new ValidationError('No such appointment.')
    }

    /* Scoped to the forum in the statement: the id is a form value. */
    await requireForumAdmin().removeModerator(id, appointmentId)

    await invalidateForumPermissions()
    await recordAdminAction({
      action: 'forum.moderator_removed',
      detail: { forumId: id, appointmentId },
    })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}
