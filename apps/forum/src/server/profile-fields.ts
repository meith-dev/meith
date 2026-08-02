import 'server-only'

/**
 * F59 — resolving custom profile fields for the current viewer.
 *
 * One function does the thing every caller needs and none of them may do
 * themselves: turn "who is looking" into the subset of per-group rules that
 * apply to them. That step goes through `Authorizer.applicableGroupRows`,
 * because groups are the Authorizer's to know (F20) — and it returns *rows*,
 * so nothing downstream ever sees a group id.
 *
 * The result is cached per request. A thread page resolves fields for every
 * distinct post author's postbit, and the rule set is board configuration that
 * cannot change mid-render.
 */
import { cache } from 'react'

import {
  ProfileFieldService,
  maxLengthFor,
  type ProfileFieldContext,
} from '@forum/profile-fields'

import { AUTH_CONFIG } from './auth-config'
import { getContainer } from './container'
import { getActor } from './context'

/**
 * How a custom field's input is named.
 *
 * Prefixed so a field keyed `website` cannot collide with F57's fixed `website`
 * input, or `username` with F18's — the two are different things stored in
 * different places, and an operator naming a field after a built-in should get
 * their field rather than a silent overwrite.
 *
 * Lives here rather than beside either form: two forms post these names and two
 * actions read them, and a prefix that drifts between them loses answers
 * silently.
 */
export const FIELD_PREFIX = 'field:'

/** The `field:<key>` entries of a submitted form, keyed by field key. */
export function submittedFields(form: FormData): ReadonlyMap<string, string> {
  const submitted = new Map<string, string>()
  for (const [name, value] of form.entries()) {
    if (name.startsWith(FIELD_PREFIX) && typeof value === 'string') {
      submitted.set(name.slice(FIELD_PREFIX.length), value)
    }
  }
  return submitted
}

/** The service, or `null` on a board with no field store (fixture mode). */
export function profileFieldService(): ProfileFieldService | null {
  const { profileFields } = getContainer()
  return profileFields === null ? null : new ProfileFieldService({ fields: profileFields })
}

/**
 * The rules that apply to the *viewer*, resolved once per request.
 *
 * Returns `null` when there is no field store, which every caller treats as
 * "this board has no custom fields" rather than as an error — the same shape
 * F56 and F57 use for their absent repositories.
 */
export const viewerFieldContext = cache(async (): Promise<ProfileFieldContext | null> => {
  const service = profileFieldService()
  if (service === null) return null

  const { authorizer } = getContainer()
  const actor = await getActor()

  /*
   * Every rule on the board, narrowed to this actor's groups by the one place
   * allowed to look at them. The list is configuration-sized, so reading it
   * whole and filtering in memory is cheaper than a query per field — and it
   * keeps the combination rule (R4.2) in one testable function.
   */
  const rules = await service.listGroupRules()
  return { applicable: authorizer.applicableGroupRows(actor, rules) }
})

/**
 * The rules an *applicant* is resolved against (F18 + F59).
 *
 * Not the viewer's: somebody filling in the register form is a guest, and
 * resolving against the guest group would ask them for whatever guests may edit
 * — which is nothing on a sane board. What the form must offer is what they
 * will be able to edit *after* registering, so the context is built from the
 * group registration puts them in.
 *
 * Not cached: the register page renders it once, and the action resolves it
 * again on a different request.
 */
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

/**
 * The fields the register form must ask for.
 *
 * Never throws, like every other read here: a board whose field configuration
 * is broken must still be able to take registrations.
 */
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

/**
 * The fields to show on somebody's profile, already filtered to what the viewer
 * may see and to the ones that have an answer.
 *
 * Never throws: a profile page that fails because a custom field is misconfigured
 * would take out a screen that works perfectly well without them.
 */
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

/**
 * The subset shown beside a post (F31's postbit).
 *
 * Separate from the profile list because the postbit renders once per post on
 * the board's heaviest page: only fields an operator explicitly marked for it
 * appear, and a board that marks none pays one cached rules read and nothing
 * else.
 */
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
