import 'server-only'

import { getContainer } from './container'
import { getActor } from './context'
import { getSettings } from './settings'

export const OFFLINE_FALLBACK_MESSAGE =
  'The board is closed for maintenance. Please try again shortly.'

export interface BoardOffline {
  readonly message: string
}

export async function boardOffline(): Promise<BoardOffline | null> {
  const settings = await getSettings()
  if (settings.get('board.offline') !== true) return null

  const actor = await getActor()
  if (getContainer().authorizer.can(actor, 'board.viewOffline')) return null

  const message = settings.get('board.offline_message').trim()
  return { message: message === '' ? OFFLINE_FALLBACK_MESSAGE : message }
}
