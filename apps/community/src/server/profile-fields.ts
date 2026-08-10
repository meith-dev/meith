import 'server-only'

import { cache } from 'react'

import {
  ProfileFieldService,
  maxLengthFor,
  type ProfileFieldContext,
} from '@meith/profile-fields'

import { AUTH_CONFIG } from './auth-config'
import { getContainer } from './container'
import { getActor } from './context'

export const FIELD_PREFIX = 'field:'

export function submittedFields(form: FormData): ReadonlyMap<string, string> {
  const submitted = new Map<string, string>()
  for (const [name, value] of form.entries()) {
    if (name.startsWith(FIELD_PREFIX) && typeof value === 'string') {
      submitted.set(name.slice(FIELD_PREFIX.length), value)
    }
  }
  return submitted
}

export function profileFieldService(): ProfileFieldService | null {
  const { profileFields } = getContainer()
  return profileFields === null ? null : new ProfileFieldService({ fields: profileFields })
}

export const viewerFieldContext = cache(async (): Promise<ProfileFieldContext | null> => {
  const service = profileFieldService()
  if (service === null) return null

  const { authorizer } = getContainer()
  const actor = await getActor()

  const rules = await service.listGroupRules()
  return { applicable: authorizer.applicableGroupRows(actor, rules) }
})

export async function registrationFieldContext(): Promise<ProfileFieldContext | null> {
  const service = profileFieldService()
  if (service === null) return null

  const { authorizer } = getContainer()
  const rules = await service.listGroupRules()

  return {
    applicable: authorizer.applicableGroupRowsForGroups(
      [AUTH_CONFIG.defaultMemberGroupId],
      rules,
    ),
  }
}

export async function registrationFields(): Promise<
  readonly { key: string; label: string; description: string | null; type: string | null; options: readonly string[]; maxLength: number }[]
> {
  const service = profileFieldService()
  if (service === null) return []

  try {
    const context = await registrationFieldContext()
    if (context === null) return []

    const fields = await service.requiredAtRegistration(context)
    return fields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description,
      type: field.type,
      options: field.options,
      maxLength: maxLengthFor(field),
    }))
  } catch {
    return []
  }
}

export async function visibleProfileFields(
  ownerUserId: number,
): Promise<readonly { label: string; value: string }[]> {
  const service = profileFieldService()
  const context = await viewerFieldContext()
  if (service === null || context === null) return []

  try {
    const resolved = await service.visibleFor(ownerUserId, context)
    return resolved.map((entry) => ({ label: entry.field.label, value: entry.value }))
  } catch {
    return []
  }
}

export async function postbitProfileFields(
  authorUserId: number,
): Promise<readonly { label: string; value: string }[]> {
  const service = profileFieldService()
  const context = await viewerFieldContext()
  if (service === null || context === null) return []

  try {
    const resolved = await service.visibleFor(authorUserId, context)
    return resolved
      .filter((entry) => entry.field.showInPostbit)
      .map((entry) => ({ label: entry.field.label, value: entry.value }))
  } catch {
    return []
  }
}
