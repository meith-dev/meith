import 'server-only'

import { getContainer } from './container'
import { getActor } from './context'
import { tr } from './i18n'
import { getSettings } from './settings'

export interface BoardOffline {
  readonly message: string
}

export async function boardOffline(): Promise<BoardOffline | null> {
  const settings = await getSettings()
  if (settings.get('board.offline') !== true) return null

  const actor = await getActor()
  if (getContainer().authorizer.can(actor, 'board.viewOffline')) return null

  const message = settings.get('board.offline_message').trim()
  return { message: message === '' ? await tr('offline.fallback') : message }
}
