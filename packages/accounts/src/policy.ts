/**
 * The parts of `AuthConfig` that are policy, not board configuration.
 *
 * Split out because two callers need identical values and must not drift: the
 * app's composition root and the operator CLI. A user created by
 * `forum user:create` has to satisfy exactly the rules the registration form
 * enforces, or the CLI becomes a way to make accounts the app then rejects —
 * the precise failure the CLI's "delegates to the same code" rule exists to
 * prevent.
 *
 * Deliberately excluded, because they are decisions a *board* makes rather than
 * facts about the software:
 *
 *   - `activationMethod` — depends on how the board wants to vet signups.
 *   - `defaultMemberGroupId` — depends on the group ladder that board has.
 *
 * These move into the settings registry (F64) once the ACP can edit them; until
 * then each caller supplies them.
 */
import type { AuthConfig } from './ports'

export type AuthPolicy = Omit<AuthConfig, 'activationMethod' | 'defaultMemberGroupId'>

export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  minPasswordLength: 8,
  usernameMin: 3,
  usernameMax: 30,
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  sessionIdleDays: 14,
  resetTokenTtlMinutes: 60,
  /*
   * Names that would let an account impersonate the board itself, or collide
   * with a route. Checked case-insensitively via `foldIdentifier`.
   */
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
}
