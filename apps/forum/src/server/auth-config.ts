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
import type { AuthConfig } from '@forum/accounts'

import { SEED_GROUP } from './seed-board'

/** Lifetime of a "remember me" family, and the idle session it mints. */
export const REMEMBER_DAYS = 30
export const SESSION_IDLE_DAYS = 14

export const AUTH_CONFIG: AuthConfig = {
  minPasswordLength: 8,
  usernameMin: 3,
  usernameMax: 30,
  // Fixture/demo activates immediately so the Checkpoint 1 flow is one step; a
  // real deployment flips this to 'email' once the outbox (F07) is wired.
  activationMethod: 'none',
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  sessionIdleDays: SESSION_IDLE_DAYS,
  resetTokenTtlMinutes: 60,
  reservedUsernames: [
    'admin',
    'administrator',
    'root',
    'moderator',
    'mod',
    'staff',
    'system',
    'guest',
    'anonymous',
    'me',
    'you',
  ],
  defaultMemberGroupId: SEED_GROUP.registered,
}
