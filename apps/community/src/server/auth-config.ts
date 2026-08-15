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

export interface BoardSessionConfig {
  readonly rememberDays: number
  readonly sessionIdleDays: number
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
    sessionIdleDays: (await boardAuthConfig()).sessionIdleDays,
  }
}

/**
 * Applied last, over the stored settings, because on a demo the stored settings
 * are whatever the last visitor left behind.
 *
 * The lockout exists to make guessing a password expensive. A demo's passwords
 * are printed on the page, so there is nothing left to guess — and the counter
 * is per account, which means one visitor mistyping `admin` five times locks the
 * published login for everyone else for a quarter of an hour. Not disabled
 * outright: this is still a login form on the open internet, and something
 * hammering it should still meet a wall.
 */
function demoOverrides(config: AuthConfig): AuthConfig {
  if (!env.DEMO_MODE) return config

  return {
    ...config,
    maxLoginAttempts: 50,
    maxAccountLoginAttempts: 500,
    lockoutMinutes: 1,
  }
}
