import 'server-only'

import { env } from '@meith/core'
import { currentMailConfig } from '@meith/drivers'
import { canSendMail, describeMailConfig, type MailConfig, type MailSource } from '@meith/settings'

import { boardAuthConfig } from './auth-config'

export interface MailReadiness {
  readonly config: MailConfig
  readonly source: MailSource
  readonly summary: string
  readonly sends: boolean
  readonly activationMethod: 'none' | 'email' | 'admin' | 'both'
  readonly unactivatable: boolean
}

export async function assessMailReadiness(): Promise<MailReadiness> {
  const { activationMethod } = await boardAuthConfig()

  let config: MailConfig
  try {
    config = await currentMailConfig()
  } catch {
    config = { transport: 'log' }
  }

  const sends = canSendMail(config)

  return {
    config,
    source: env.MAIL_DRIVER === 'log' ? 'board' : 'environment',
    summary: describeMailConfig(config),
    sends,
    activationMethod,
    unactivatable:
      !sends &&
      env.NODE_ENV !== 'development' &&
      (activationMethod === 'email' || activationMethod === 'both'),
  }
}
