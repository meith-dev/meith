'use server'

import { revalidatePath } from 'next/cache'

import { CacheTags, PERMISSION_FIELDS, ValidationError, isAppError, logger } from '@meith/core'
import { permissionsCarryPower } from '@meith/db'
import { drivers } from '@meith/drivers'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import { promotionService, requireGroupAdmin } from './group-admin'
import { assertSafeCssValue } from './theme-style'
import type { FormState } from './auth-form-state'

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

async function invalidatePermissions(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.permissions()])
  revalidatePath('/admin/groups')
  revalidatePath('/admin/groups/[id]', 'page')
}

function groupColour(form: FormData, field: string): string | null {
  const value = text(form, field)
  if (value === '') return null
  assertSafeCssValue(`group colour "${field}"`, value)
  return value
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

    const isStaffGroup = checkbox(form, 'isStaffGroup')
    const pluginGrantable = checkbox(form, 'pluginGrantable')

    if (pluginGrantable) {
      // The same refusals the grant call makes, made early so the operator
      // hears them while the checkbox is in front of them rather than when a
      // plugin's first grant fails.
      if (isStaffGroup) {
        throw new ValidationError(
          'A staff group cannot be granted by plugins — staff is appointed, not sold.',
        )
      }
      const repository = requireGroupAdmin()
      const summary = (await repository.list()).find((group) => group.id === id)
      if (summary?.isSystem === true) {
        throw new ValidationError(
          'A system group cannot be granted by plugins. The board resolves it by key.',
        )
      }
      const permissions = await repository.readPermissions(id)
      if (permissions !== null && permissionsCarryPower(permissions)) {
        throw new ValidationError(
          'This group carries administrative or moderation power, so plugins may not grant it. ' +
            'Make a separate group for what a plugin hands out.',
        )
      }
    }

    await requireGroupAdmin().updateIdentity(id, {
      title,
      description: text(form, 'description') === '' ? null : text(form, 'description'),
      displayOrder: order,
      isStaffGroup,
      pluginGrantable,
      badgeToken: text(form, 'badgeToken') === '' ? null : text(form, 'badgeToken'),
      nameColorLight: groupColour(form, 'nameColorLight'),
      nameColorDark: groupColour(form, 'nameColorDark'),
    })

    await invalidatePermissions()
    await recordAdminAction({ action: 'group.updated', detail: { groupId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

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

    if (text(form, 'copyFromGroupId') === '') {
      throw new ValidationError(
        'Choose a group to copy permissions from. Starting from the defaults ' +
          'would deny everything, which makes a group whose members cannot see ' +
          'the board.',
      )
    }

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
