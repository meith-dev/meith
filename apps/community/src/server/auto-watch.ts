import 'server-only'

import type { SubscriptionMode } from '@meith/subscriptions'
import type { SubscriptionCadence } from '@meith/threads'

import { getContainer } from './container'

export type AutoWatchKind = 'create' | 'reply'

export async function autoWatchPreference(
  userId: number | null,
  kind: AutoWatchKind,
): Promise<SubscriptionMode> {
  if (userId === null) return 'none'

  const { memberSettings } = getContainer()
  if (memberSettings === null) return 'none'

  const settings = await memberSettings.read(userId)
  if (settings === null) return 'none'

  return kind === 'create' ? settings.autoWatchOwnThreads : settings.autoWatchRepliedThreads
}

export function autoWatchChecksByDefault(preference: SubscriptionMode): boolean {
  return preference !== 'none'
}

export function autoWatchCadence(preference: SubscriptionMode): SubscriptionCadence {
  return preference === 'none' ? 'instant' : preference
}
