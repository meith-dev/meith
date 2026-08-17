'use server'

import { revalidatePath } from 'next/cache'

import { PERMISSION_FIELDS, ValidationError } from '@meith/core'
import { permissionsCarryPower } from '@meith/db'
import type { PromotionRuleInput } from '@meith/groups'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { formStateReporter } from './form-state-reporter'
import { checkbox, trimmedText } from './form-values'
import { promotionService, requireGroupAdmin, requirePromotionRules } from './group-admin'
import { assertSafeCssValue } from './theme-style'

const CHUNK = 500

function groupId(form: FormData, name = 'groupId'): number {
  const id = Number(trimmedText(form, name))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('No such group.')
  return id
}

const toFormState = formStateReporter('group-admin', 'group administration write failed')

function refreshGroupScreens(): void {
  revalidatePath('/admin/groups')
  revalidatePath('/admin/groups/[id]', 'page')
}

function refreshPromotionScreen(): void {
  revalidatePath('/admin/groups/promotions')
}

function ruleId(form: FormData): number {
  const id = Number(trimmedText(form, 'id'))
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('No such promotion rule.')
  return id
}

function blankOr(form: FormData, name: string): number | null {
  const raw = trimmedText(form, name)
  return raw === '' ? null : Number(raw)
}

function promotionRuleInput(form: FormData): PromotionRuleInput {
  return {
    title: trimmedText(form, 'title'),
    displayOrder: blankOr(form, 'displayOrder') ?? 0,
    minPostCount: blankOr(form, 'minPostCount'),
    minReputation: blankOr(form, 'minReputation'),
    minDaysRegistered: blankOr(form, 'minDaysRegistered'),
    fromPrimaryGroupId: blankOr(form, 'fromPrimaryGroupId'),
    toPrimaryGroupId: Number(trimmedText(form, 'toPrimaryGroupId')),
  }
}

function groupColour(form: FormData, field: string): string | null {
  const value = trimmedText(form, field)
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

    const title = trimmedText(form, 'title')
    if (title === '') throw new ValidationError('A group needs a title.')

    const order = Number(trimmedText(form, 'displayOrder'))
    if (!Number.isSafeInteger(order) || order < 0) {
      throw new ValidationError('Display order must be a whole number.')
    }

    const isStaffGroup = checkbox(form, 'isStaffGroup')
    const pluginGrantable = checkbox(form, 'pluginGrantable')

    if (pluginGrantable) {
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
      description: trimmedText(form, 'description') || null,
      displayOrder: order,
      isStaffGroup,
      pluginGrantable,
      badgeToken: trimmedText(form, 'badgeToken') === '' ? null : trimmedText(form, 'badgeToken'),
      nameColorLight: groupColour(form, 'nameColorLight'),
      nameColorDark: groupColour(form, 'nameColorDark'),
    })

    refreshGroupScreens()
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
        const raw = trimmedText(form, field.key)
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

    refreshGroupScreens()
    await recordAdminAction({ action: 'group.permissions_changed', detail: { groupId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function createGroupAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin()

    const key = trimmedText(form, 'key')
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new ValidationError(
        'A key may contain lower-case letters, numbers and underscores, and must start with a letter.',
      )
    }

    const title = trimmedText(form, 'title')
    if (title === '') throw new ValidationError('A group needs a title.')

    if (trimmedText(form, 'copyFromGroupId') === '') {
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

    refreshGroupScreens()
    await recordAdminAction({ action: 'group.created', detail: { groupId: id, key } })

    return { notice: 'created' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteGroupAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const id = groupId(form)
    const moveTo = groupId(form, 'moveMembersTo')

    await requireGroupAdmin().remove(id, moveTo)

    refreshGroupScreens()
    await recordAdminAction({
      action: 'group.deleted',
      detail: { groupId: id, movedTo: moveTo },
    })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function moveMembersAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const from = groupId(form, 'fromGroupId')
    const to = groupId(form, 'toGroupId')

    const after = Number(trimmedText(form, 'afterUserId') || '0')
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new ValidationError('Lost track of where the run had got to. Start again.')
    }

    const chunk = await requireGroupAdmin().moveMembersChunk({
      fromGroupId: from,
      toGroupId: to,
      afterUserId: after,
      limit: CHUNK,
    })

    refreshGroupScreens()
    await recordAdminAction({
      action: 'group.members_moved',
      detail: { fromGroupId: from, toGroupId: to, moved: chunk.moved },
    })

    const total = Number(trimmedText(form, 'movedSoFar') || '0') + chunk.moved

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

export async function createPromotionRuleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const id = await requirePromotionRules().createRule(promotionRuleInput(form))

    refreshPromotionScreen()
    await recordAdminAction({ action: 'group.promotion_rule_added', detail: { ruleId: id } })

    return { notice: 'created' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updatePromotionRuleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = ruleId(form)

    await requirePromotionRules().updateRule(id, promotionRuleInput(form))

    refreshPromotionScreen()
    await recordAdminAction({ action: 'group.promotion_rule_changed', detail: { ruleId: id } })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function setPromotionRuleEnabledAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()
    const id = ruleId(form)
    const enabled = checkbox(form, 'enabled')

    await requirePromotionRules().setRuleEnabled(id, enabled)

    refreshPromotionScreen()
    await recordAdminAction({
      action: 'group.promotion_rule_toggled',
      detail: { ruleId: id, enabled },
    })

    return { notice: enabled ? 'enabled' : 'disabled' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deletePromotionRuleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const id = ruleId(form)

    await requirePromotionRules().deleteRule(id)

    refreshPromotionScreen()
    await recordAdminAction({ action: 'group.promotion_rule_removed', detail: { ruleId: id } })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function applyPromotionsAction(_prev: FormState, _form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()

    const result = await promotionService().apply()

    refreshGroupScreens()
    refreshPromotionScreen()
    await recordAdminAction({
      action: 'group.promotions_applied',
      detail: { promoted: result.outcomes.length, examined: result.examined },
    })

    return { notice: `promoted:${result.outcomes.length}` }
  } catch (err) {
    return toFormState(err)
  }
}
