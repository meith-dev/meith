export type AddVerdict = 'allowed' | 'guest' | 'not-an-organiser'

export interface CalendarConfig {
  readonly anyMemberMayAdd: boolean
}

export function resolveCalendarConfig(
  settings: Readonly<Record<string, string | number | boolean>>,
): CalendarConfig {
  return { anyMemberMayAdd: settings.any_member_may_add === true }
}

export function mayAdd(input: {
  readonly userId: number | null
  readonly config: CalendarConfig
  readonly organisers: readonly number[]
}): AddVerdict {
  if (input.userId === null) return 'guest'
  if (input.config.anyMemberMayAdd) return 'allowed'
  return input.organisers.includes(input.userId) ? 'allowed' : 'not-an-organiser'
}

export function mayManage(input: {
  readonly userId: number | null
  readonly createdByUserId: number | null
  readonly organisers: readonly number[]
}): boolean {
  if (input.userId === null) return false
  if (input.createdByUserId === input.userId) return true
  return input.organisers.includes(input.userId)
}
