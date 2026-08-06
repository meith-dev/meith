import 'server-only'

import { DEFAULT_AUTH_POLICY, resolveAuthPolicy, type AuthConfig } from '@meith/accounts'
import { env } from '@meith/core'

import { SEED_GROUP } from './seed-board'
import { getSettings } from './settings'

export const REMEMBER_DAYS = 30
export const SESSION_IDLE_DAYS = 14

export const AUTH_CONFIG: AuthConfig = {
  ...DEFAULT_AUTH_POLICY,
  sessionIdleDays: SESSION_IDLE_DAYS,
  activationMethod: 'none',
  defaultMemberGroupId: SEED_GROUP.registered,
}

export async function boardAuthConfig(): Promise<AuthConfig> {
  if (env.DATA_SOURCE !== 'postgres') return AUTH_CONFIG

  const settings = await getSettings()
  return {
    ...AUTH_CONFIG,
    ...resolveAuthPolicy((key) => settings.get(key as never), AUTH_CONFIG),
  }
}
