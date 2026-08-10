'use server'

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

async function invalidateTree(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.forumTree()])
  revalidatePath('/admin/forums')
  revalidatePath('/admin/forums/[id]', 'page')
}

async function invalidateForumPermissions(): Promise<void> {
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
      values[field.key] = readMatrixCell(field, typeof raw === 'string' ? raw : undefined)
    }

    await requireForumAdmin().saveOverrides(id, groupId, values)

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
      detail: { forumId: id, forums: descendants.length },
    })

    return { notice: 'copied' }
  } catch (err) {
    return toFormState(err)
  }
}

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
