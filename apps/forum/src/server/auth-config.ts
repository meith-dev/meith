import 'server-only'

/**
 * Board-wide auth policy (F17–F19).
 *
 * These will eventually be ACP settings (F13), but no auth settings are
 * registered yet, so the composition root owns the defaults for now. Centralised
 * here so both `DATA_SOURCE` branches build the identity services with identical
 * policy — parity in, parity out.
 *
 * `defaultMemberGroupId` and `reservedUsernames` mirror the seed board so a
 * fixture registration lands the new user in the same group a Postgres one would.
 */
import { DEFAULT_AUTH_POLICY, type AuthConfig } from '@meith/accounts'
import { env } from '@meith/core'

import { SEED_GROUP } from './seed-board'
import { getSettings } from './settings'

/** Lifetime of a "remember me" family, and the idle session it mints. */
export const REMEMBER_DAYS = 30
export const SESSION_IDLE_DAYS = 14

export const AUTH_CONFIG: AuthConfig = {
  /*
   * Shared with the operator CLI so an account made by `forum user:create`
   * satisfies exactly the rules the registration form enforces. Only the two
   * board-level decisions are set here.
   */
  ...DEFAULT_AUTH_POLICY,
  sessionIdleDays: SESSION_IDLE_DAYS,
  /*
   * The fallback, and the value a board without stored settings keeps. What an
   * operator chose lives in `registration.method`; `boardAuthConfig()` below is
   * what reads it, and every path that creates an account goes through there.
   */
  activationMethod: 'none',
  defaultMemberGroupId: SEED_GROUP.registered,
}

/**
 * The board's auth policy with the one field an operator actually chooses
 * resolved from F08's registry (F13).
 *
 * `AUTH_CONFIG` is a static const shared by three composition roots, and it has
 * to stay one — the password rules and the default group are decisions of the
 * *build*, and re-reading them per request would buy nothing. `registration.method`
 * is the opposite: it is a dropdown in the ACP, and until this function existed
 * changing it changed nothing at all, because every caller took the hardcoded
 * `'none'`. So the policy stays static and the one runtime value is resolved at
 * the point of use, the same way `usercp-mail.ts` resolves the board name.
 *
 * Async, and therefore only usable from a Server Action or a route — which is
 * exactly where accounts are created, and is why `getContainer()` keeps handing
 * out a service built on the static config for everything else.
 */
export async function boardAuthConfig(): Promise<AuthConfig> {
  /*
   * Fixture mode has no settings table, so `getSettings()` would hand back the
   * registry default — 'email' — as though somebody had chosen it. Nobody did,
   * and nobody on a sample-data board *can*: there is nowhere to store the
   * change. The demo's documented one-step registration stands rather than
   * being broken by a value no operator picked and none can unpick.
   */
  if (env.DATA_SOURCE !== 'postgres') return AUTH_CONFIG

  const stored = (await getSettings()).get('registration.method')
  return {
    ...AUTH_CONFIG,
    activationMethod: isActivationMethod(stored) ? stored : AUTH_CONFIG.activationMethod,
  }
}

/** The four the registry's schema allows, as a value this file can check. */
const ACTIVATION_METHODS = ['none', 'email', 'admin', 'both'] as const satisfies
  readonly AuthConfig['activationMethod'][]

/**
 * Narrow the stored string to the union `AuthConfig` promises.
 *
 * The registry already validates the value against the same four names, so this
 * can only fail for a row written around it. It falls back rather than throwing
 * for that case: a board with one bad settings row should still be able to
 * register people, and the safe direction is the *stricter* policy the const
 * carries, not the looser one.
 */
function isActivationMethod(value: string): value is AuthConfig['activationMethod'] {
  return (ACTIVATION_METHODS as readonly string[]).includes(value)
}
