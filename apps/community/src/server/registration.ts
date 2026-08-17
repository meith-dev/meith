import 'server-only'

import { boardAuthConfig } from './auth-config'

export async function registrationOpen(): Promise<boolean> {
  return (await boardAuthConfig()).registrationEnabled
}
