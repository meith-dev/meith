import 'server-only'

import { boardAuthConfig } from './auth-config'

export const REGISTRATION_CLOSED_TITLE = 'Registration is closed'

export const REGISTRATION_CLOSED_LEDE =
  'This board is not taking new members at the moment. If you already have an ' +
  'account you can still sign in.'

export async function registrationOpen(): Promise<boolean> {
  return (await boardAuthConfig()).registrationEnabled
}
