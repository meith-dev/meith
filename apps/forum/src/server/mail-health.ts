import 'server-only'

import { env } from '@meith/core'

import { boardAuthConfig } from './auth-config'

export interface MailReadiness {
  readonly driver: typeof env.MAIL_DRIVER
  readonly activationMethod: 'none' | 'email' | 'admin' | 'both'
  readonly unactivatable: boolean
}

export async function assessMailReadiness(): Promise<MailReadiness> {
  const { activationMethod } = await boardAuthConfig()
  const driver = env.MAIL_DRIVER

  return {
    driver,
    activationMethod,
    unactivatable:
      driver === 'log' &&
      env.NODE_ENV !== 'development' &&
      (activationMethod === 'email' || activationMethod === 'both'),
  }
}
