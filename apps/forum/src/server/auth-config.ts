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
import { DEFAULT_AUTH_POLICY, resolveAuthPolicy, type AuthConfig } from '@meith/accounts'
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
 * The board's auth policy with the fields an operator actually chooses resolved
 * from F08's registry (F13).
 *
 * `AUTH_CONFIG` is a static const shared by three composition roots, and most of
 * it has to stay one — the lockout window, the session lifetime and the default
 * group are decisions of the *build*, and re-reading them per request would buy
 * nothing.
 *
 * Four of them are the opposite: they are fields in the ACP, and until this
 * function existed moving any of them changed nothing at all, because every
 * caller took the const. The activation method, the minimum password length and
 * the two username bounds are resolved at the point of use, the same way
 * `usercp-mail.ts` resolves the board name. `resolveAuthPolicy` is in
 * `@meith/accounts` rather than here because the CLI and the installer resolve
 * the same four, and three implementations of one mapping is three ways for the
 * CLI to create an account the board would have refused.
 *
 * Async, and therefore only usable from a Server Action or a route — which is
 * where accounts are created and passwords are chosen, and is why
 * `getContainer()` keeps handing out a service built on the static config for
 * everything else.
 */
export async function boardAuthConfig(): Promise<AuthConfig> {
  /*
   * Fixture mode has no settings table, so `getSettings()` would hand back
   * registry defaults as though somebody had chosen them. Nobody did, and
   * nobody on a sample-data board *can*: there is nowhere to store the change.
   * The demo keeps the const it has always run on.
   */
  if (env.DATA_SOURCE !== 'postgres') return AUTH_CONFIG

  const settings = await getSettings()
  return {
    ...AUTH_CONFIG,
    ...resolveAuthPolicy((key) => settings.get(key as never), AUTH_CONFIG),
  }
}
