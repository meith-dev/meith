import { type BoardUrlEnvironment, resolveBoardUrl } from './board-url'
import type { SettingsSnapshot } from './store'

export interface PushConfig {
  readonly publicKey: string
  readonly privateKey: string
  readonly subject: string
}

export type PushProblem = 'disabled' | 'no-keys' | 'no-subject'

export type PushResolution =
  | { readonly config: PushConfig; readonly problem: null }
  | { readonly config: null; readonly problem: PushProblem }

export function pushContact(input: {
  readonly environment: BoardUrlEnvironment
  readonly settings: SettingsSnapshot
}): string {
  const stated = input.settings.get('push.contact').trim()
  if (stated !== '') return stated

  const from = input.settings.get('mail.from').trim()
  if (from !== '') return `mailto:${from}`

  const { url } = resolveBoardUrl(input)
  return url.startsWith('https://') ? url : ''
}

export function resolvePushConfig(input: {
  readonly environment: BoardUrlEnvironment
  readonly settings: SettingsSnapshot
}): PushResolution {
  if (!input.settings.get('push.enabled')) return { config: null, problem: 'disabled' }

  const publicKey = input.settings.get('push.vapid_public_key').trim()
  const privateKey = input.settings.get('push.vapid_private_key').trim()
  if (publicKey === '' || privateKey === '') return { config: null, problem: 'no-keys' }

  const subject = pushContact(input)
  if (subject === '') return { config: null, problem: 'no-subject' }

  return { config: { publicKey, privateKey, subject }, problem: null }
}
