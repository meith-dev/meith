import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import { resolveTimezone, TIMEZONE_COOKIE } from '@/view/timezone'

import { getContainer } from './container'
import { getActor } from './context'
import { getSettings } from './settings'

export interface ViewerPreferences {
  readonly timezone: string
  readonly timezoneIsAutomatic: boolean
  readonly locale: string | null
  readonly postsPerPage: number
  readonly threadsPerPage: number
}

const detectedZone = cache(async (): Promise<string | null> => {
  try {
    return (await cookies()).get(TIMEZONE_COOKIE)?.value ?? null
  } catch {
    return null
  }
})

export const getViewerPreferences = cache(async (): Promise<ViewerPreferences> => {
  const detected = await detectedZone()

  const settings = await getSettings()
  const defaults = {
    postsPerPage: settings.get('display.posts_per_page'),
    threadsPerPage: settings.get('display.threads_per_page'),
  }

  const stored = await storedSettings()
  const timezone = resolveTimezone({ stored: stored?.timezone ?? null, detected })

  return {
    timezone: timezone.zone,
    timezoneIsAutomatic: timezone.isAutomatic,
    locale: stored?.locale ?? null,
    postsPerPage: stored?.postsPerPage ?? defaults.postsPerPage,
    threadsPerPage: stored?.threadsPerPage ?? defaults.threadsPerPage,
  }
})

async function storedSettings(): Promise<{
  readonly timezone: string
  readonly locale: string
  readonly postsPerPage: number | null
  readonly threadsPerPage: number | null
} | null> {
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) return null

  try {
    return await memberSettings.read(actor.userId)
  } catch {
    return null
  }
}
