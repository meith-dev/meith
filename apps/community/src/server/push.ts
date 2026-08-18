import 'server-only'

import { env } from '@meith/core'
import { isVapidPublicKey } from '@meith/notifications'
import { type PushProblem, resolvePushConfig } from '@meith/settings'

import { getSettings } from './settings'

export interface PushAvailability {
  readonly enabled: boolean
  readonly publicKey: string
}

const OFF: PushAvailability = { enabled: false, publicKey: '' }

export interface PushReadiness {
  readonly live: boolean
  readonly problem: PushProblem | 'bad-key' | null
}

export async function pushAvailability(): Promise<PushAvailability> {
  try {
    const { config } = resolvePushConfig({ environment: env, settings: await getSettings() })
    if (config === null || !isVapidPublicKey(config.publicKey)) return OFF
    return { enabled: true, publicKey: config.publicKey }
  } catch {
    return OFF
  }
}

export async function pushReadiness(): Promise<PushReadiness> {
  const { config, problem } = resolvePushConfig({
    environment: env,
    settings: await getSettings(),
  })

  if (config === null) return { live: false, problem }
  if (!isVapidPublicKey(config.publicKey)) return { live: false, problem: 'bad-key' }
  return { live: true, problem: null }
}
