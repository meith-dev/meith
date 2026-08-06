import 'server-only'

import { cache } from 'react'

import { DEFAULT_TIMEZONE } from '@/view/time'

import { getContainer } from './container'
import { getActor } from './context'
import { getSettings } from './settings'

export interface ViewerPreferences {
  readonly timezone: string
  readonly postsPerPage: number
  readonly threadsPerPage: number
}

async function boardDefaults(): Promise<ViewerPreferences> {
  const settings = await getSettings()
  return {
    timezone: DEFAULT_TIMEZONE,
    postsPerPage: settings.get('display.posts_per_page'),
    threadsPerPage: settings.get('display.threads_per_page'),
  }
}

export const getViewerPreferences = cache(async (): Promise<ViewerPreferences> => {
  const defaults = await boardDefaults()

  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) return defaults

  try {
    const settings = await memberSettings.read(actor.userId)
    if (settings === null) return defaults

    return {
      timezone: settings.timezone,
      postsPerPage: settings.postsPerPage ?? defaults.postsPerPage,
      threadsPerPage: settings.threadsPerPage ?? defaults.threadsPerPage,
    }
  } catch {
    return defaults
  }
})
