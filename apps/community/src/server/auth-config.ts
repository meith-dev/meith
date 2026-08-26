import 'server-only'

import { type AuthConfig, DEFAULT_AUTH_POLICY, resolveAuthPolicy } from '@meith/accounts'
import { env } from '@meith/core'

import { SEED_GROUP } from './seed-board'
import { getSettings } from './settings'

export const REMEMBER_DAYS = 30
export const SESSION_LIFETIME_DAYS = 14

export const AUTH_CONFIG: AuthConfig = {
  ...DEFAULT_AUTH_POLICY,
  sessionLifetimeDays: SESSION_LIFETIME_DAYS,
  activationMethod: 'none',
  defaultMemberGroupId: SEED_GROUP.registered,
}

export interface BoardSessionConfig {
  readonly rememberDays: number
  readonly sessionLifetimeDays: number
}

export async function boardAuthConfig(): Promise<AuthConfig> {
  if (env.DATA_SOURCE !== 'postgres') return AUTH_CONFIG

  const settings = await getSettings()
  return demoOverrides({
    ...AUTH_CONFIG,
    ...resolveAuthPolicy((key) => settings.get(key as never), AUTH_CONFIG),
  })
}

export async function boardSessionConfig(): Promise<BoardSessionConfig> {
  return {
    rememberDays: REMEMBER_DAYS,
    sessionLifetimeDays: (await boardAuthConfig()).sessionLifetimeDays,
  }
}

function demoOverrides(config: AuthConfig): AuthConfig {
  if (!env.DEMO_MODE) return config

  return {
    ...config,
    maxLoginAttempts: 50,
    maxAccountLoginAttempts: 500,
    lockoutMinutes: 1,
  }
}
