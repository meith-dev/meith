import 'server-only'

import { env } from '@meith/core'
import { resolveBoardUrl, type BoardUrlResolution } from '@meith/settings'

import { getSettings } from './settings'

export async function boardUrlResolution(): Promise<BoardUrlResolution> {
  return resolveBoardUrl({ environment: env, settings: await getSettings() })
}

export async function boardUrl(): Promise<string> {
  return (await boardUrlResolution()).url
}
