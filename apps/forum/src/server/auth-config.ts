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
import { DEFAULT_AUTH_POLICY, type AuthConfig } from '@forum/accounts'

import { SEED_GROUP } from './seed-board'

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
  // Fixture/demo activates immediately so the Checkpoint 1 flow is one step; a
  // real deployment flips this to 'email' once the outbox (F07) is wired.
  activationMethod: 'none',
  defaultMemberGroupId: SEED_GROUP.registered,
}
