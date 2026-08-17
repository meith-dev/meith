'use server'

import { revalidatePath } from 'next/cache'

import { readMatrixCell } from '@meith/authorization'
import { CacheTags, FORUM_PERMISSION_FIELDS, ValidationError } from '@meith/core'
import { MODERATOR_RIGHTS } from '@meith/db'
import { drivers } from '@meith/drivers'
import {
  type DropTarget,
  type ForumOutlineRow,
  isNudge,
  isWhereItIs,
  moveTargetOf,
  nudgeTarget,
  outlineOf,
} from '@meith/forums'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { formStateReporter } from './form-state-reporter'
import { checkbox, trimmedText } from './form-values'
import { requireForumAdmin } from './forum-admin'

function forumId(form: FormData): number {
  const id = Number(trimmedText(form, 'forumId'))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('No such forum.')
  return id
}

const toFormState = formStateReporter('forum-admin', 'forum administration write failed')

async function invalidateTree(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.forumTree()])
  revalidatePath('/admin/forums')
  revalidatePath('/admin/forums/[id]', 'page')
}

function refreshForumPermissionScreens(): void {
  revalidatePath('/admin/forums/[id]', 'page')
  revalidatePath('/admin/forums/[id]/permissions', 'page')
}

export async function saveForumOptionsAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const repository = requireForumAdmin()

    const title = trimmedText(form, 'title')
    const slug = trimmedText(form, 'slug')
    if (title === '') throw new ValidationError('A forum needs a title.')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      throw new ValidationError(
        'A slug may contain lower-case letters, numbers and single hyphens.',
      )
    }

    const order = Number(trimmedText(form, 'displayOrder'))
    if (!Number.isSafeInteger(order) || order < 0) {
      throw new ValidationError('Display order must be a whole number.')
    }

    await repository.updateOptions(id, {
      title,
      slug,
      description: trimmedText(form, 'description') || null,
      linkUrl: trimmedText(form, 'linkUrl') === '' ? null : trimmedText(form, 'linkUrl'),
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

export async function saveForumPermissionsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const groupId = Number(trimmedText(form, 'groupId'))
    if (!Number.isSafeInteger(groupId) || groupId <= 0) {
      throw new ValidationError('No such group.')
    }

    const values: Record<string, boolean | number | null> = {}
    for (const field of FORUM_PERMISSION_FIELDS) {
      const raw = form.get(field.key)
      values[field.key] = readMatrixCell(field, typeof raw === 'string' ? raw : undefined)
    }

    await requireForumAdmin().saveOverrides(id, groupId, values)

    refreshForumPermissionScreens()
    await recordAdminAction({
      action: 'forum.permissions_changed',
      detail: { forumId: id, groupId },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

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

    refreshForumPermissionScreens()
    await recordAdminAction({
      action: 'forum.permissions_copied',
      detail: { forumId: id, forums: descendants.length },
    })

    return { notice: 'copied' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function createForumAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const { forums } = getContainer()

    const type = trimmedText(form, 'type')
    if (type !== 'category' && type !== 'forum' && type !== 'link') {
      throw new ValidationError('Choose a category, a forum or a link.')
    }

    const title = trimmedText(form, 'title')
    const slug = trimmedText(form, 'slug')
    if (title === '') throw new ValidationError('A forum needs a title.')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      throw new ValidationError(
        'A slug may contain lower-case letters, numbers and single hyphens.',
      )
    }

    const parent = trimmedText(form, 'parentId')
    const parentId = parent === '' ? null : Number(parent)
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) {
      throw new ValidationError('No such parent forum.')
    }

    await forums.create({
      type,
      title,
      slug,
      ...(trimmedText(form, 'description') === ''
        ? {}
        : { description: trimmedText(form, 'description') }),
      parentId,
      ...(trimmedText(form, 'linkUrl') === '' ? {} : { linkUrl: trimmedText(form, 'linkUrl') }),
    })

    await invalidateTree()
    await recordAdminAction({ action: 'forum.created', detail: { slug, type } })

    return { notice: 'created' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function moveForumAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const id = forumId(form)

    const parent = trimmedText(form, 'newParentId')
    const newParentId = parent === '' ? null : Number(parent)
    if (newParentId !== null && (!Number.isSafeInteger(newParentId) || newParentId <= 0)) {
      throw new ValidationError('No such parent forum.')
    }
    if (newParentId === id) {
      throw new ValidationError('A forum cannot be its own parent.')
    }

    await getContainer().forums.move(id, { newParentId })

    await invalidateTree()
    refreshForumPermissionScreens()
    await recordAdminAction({
      action: 'forum.moved',
      detail: { forumId: id, newParentId },
    })

    return { notice: 'moved' }
  } catch (err) {
    return toFormState(err)
  }
}

function dropTarget(form: FormData, outline: readonly ForumOutlineRow[], id: number): DropTarget {
  const nudge = trimmedText(form, 'nudge')

  if (nudge !== '') {
    if (!isNudge(nudge)) throw new ValidationError('That is not a direction.')

    const target = nudgeTarget(outline, id, nudge)
    if (target === null) {
      throw new ValidationError('That forum cannot go any further in that direction.')
    }
    return target
  }

  const parent = trimmedText(form, 'parentId')
  const after = trimmedText(form, 'afterId')
  const parentId = parent === '' ? null : Number(parent)
  const afterId = after === '' ? null : Number(after)

  if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) {
    throw new ValidationError('No such parent forum.')
  }
  if (afterId !== null && (!Number.isSafeInteger(afterId) || afterId <= 0)) {
    throw new ValidationError('No such forum to follow.')
  }

  return { parentId, afterId }
}

export async function arrangeForumAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)

    const { forums } = getContainer()
    const outline = outlineOf(await forums.listAll())

    const row = outline.find((entry) => entry.id === id)
    if (row === undefined) throw new ValidationError('No such forum.')

    const target = dropTarget(form, outline, id)
    if (isWhereItIs(outline, id, target)) return { notice: 'unmoved' }

    if (target.parentId !== row.parentId) await requireFreshAdmin()

    await forums.move(id, moveTargetOf(target))

    await invalidateTree()
    refreshForumPermissionScreens()
    await recordAdminAction({
      action: 'forum.moved',
      detail: { forumId: id, newParentId: target.parentId, afterId: target.afterId },
    })

    return { notice: 'moved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function appointModeratorAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const repository = requireForumAdmin()

    const username = trimmedText(form, 'username')
    const groupRaw = trimmedText(form, 'groupId')

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

    refreshForumPermissionScreens()
    await recordAdminAction({
      action: 'forum.moderator_appointed',
      detail: { forumId: id, userId, groupId },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function removeModeratorAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()
    const id = forumId(form)
    const appointmentId = Number(trimmedText(form, 'appointmentId'))
    if (!Number.isSafeInteger(appointmentId) || appointmentId <= 0) {
      throw new ValidationError('No such appointment.')
    }

    await requireForumAdmin().removeModerator(id, appointmentId)

    refreshForumPermissionScreens()
    await recordAdminAction({
      action: 'forum.moderator_removed',
      detail: { forumId: id, appointmentId },
    })

    return { notice: 'removed' }
  } catch (err) {
    return toFormState(err)
  }
}
