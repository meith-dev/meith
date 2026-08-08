/**
 * The parts of `AuthConfig` that are policy, not board configuration — and the
 * one function that lays a board's own answers over them.
 *
 * Split out because three callers need identical values and must not drift: the
 * app's composition root, the installer and the operator CLI. A user created by
 * `forum user:create` has to satisfy exactly the rules the registration form
 * enforces, or the CLI becomes a way to make accounts the app then rejects —
 * the precise failure the CLI's "delegates to the same code" rule exists to
 * prevent. That is also why `resolveAuthPolicy` lives here rather than in the
 * app: three roots resolving the same four settings three times is three places
 * for the answer to differ.
 *
 * Deliberately excluded from `DEFAULT_AUTH_POLICY`, because they are decisions
 * a *board* makes rather than facts about the software:
 *
 *   - `activationMethod` — depends on how the board wants to vet signups.
 *   - `defaultMemberGroupId` — depends on the group ladder that board has.
 */
import type { AuthConfig } from './ports'

export type AuthPolicy = Omit<AuthConfig, 'activationMethod' | 'defaultMemberGroupId'>

export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  minPasswordLength: 8,
  usernameMin: 3,
  usernameMax: 30,
  maxLoginAttempts: 5,
  /*
   * Ten times the per-address ceiling, and the ratio is the whole design.
   *
   * Five is right for one address: a person who has mistyped their password
   * five times is not about to get it right on the sixth, and a guesser is
   * stopped early. It is *wrong* as an account-wide number, because then
   * anybody who can read a username off a post — everybody — can spend those
   * five on somebody else's behalf and lock them out. That is what this pair
   * separates.
   *
   * Fifty is chosen to sit above any plausible legitimate total (a member on
   * three devices, all mistyping, still clears their counters the moment one of
   * them succeeds) and far below what a brute force needs. It only ever
   * engages when the guessing is spread across addresses, which is the case the
   * narrow counter cannot see.
   */
  maxAccountLoginAttempts: 50,
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

/**
 * Which setting carries each board-configurable part of `AuthConfig`.
 *
 * Named here rather than at the call sites so the three composition roots
 * cannot key off three different strings — a typo in one of them would be a
 * board whose CLI quietly enforces the built-in rule while its registration
 * form enforces the operator's.
 */
export const AUTH_SETTING_KEYS = {
  activationMethod: 'registration.method',
  minPasswordLength: 'registration.min_password_length',
  usernameMin: 'registration.username_min',
  usernameMax: 'registration.username_max',
} as const

/**
 * How a caller reads one stored setting.
 *
 * A function rather than the settings snapshot itself, so this package keeps no
 * dependency on `@meith/settings` (R2) — and so the CLI, which holds a
 * repository rather than a snapshot, can answer with whatever it has.
 */
export type SettingReader = (key: string) => unknown

/** The board-configured half of `AuthConfig`, ready to spread over a policy. */
export interface ResolvedAuthSettings {
  readonly activationMethod: AuthConfig['activationMethod']
  readonly minPasswordLength: number
  readonly usernameMin: number
  readonly usernameMax: number
}

const ACTIVATION_METHODS: readonly AuthConfig['activationMethod'][] = [
  'none',
  'email',
  'admin',
  'both',
]

/**
 * Lay a board's stored answers over a base policy.
 *
 * **Every value is checked here rather than trusted**, even though the settings
 * registry validates on the way in. This is reached with a plain reader, one of
 * which is a repository handing back rows a person could have edited by hand,
 * and the cost of a bad value is not a wrong number: a `usernameMin` of `NaN`
 * makes every comparison false and every username acceptable. Anything that
 * does not survive the check falls back to `base`, which is the *stricter*
 * direction and keeps the board registering people.
 *
 * The one cross-field rule is `usernameMin <= usernameMax`. The registry
 * validates each field alone, so an operator can save a minimum of 30 against a
 * maximum of 10 — a pair no username can satisfy, which is a registration form
 * that refuses everybody with a message naming two numbers that look fine. Both
 * revert together, because honouring one half of an impossible pair would be a
 * rule nobody chose.
 */
export function resolveAuthPolicy(
  read: SettingReader,
  base: AuthPolicy & { readonly activationMethod: AuthConfig['activationMethod'] },
): ResolvedAuthSettings {
  const method = read(AUTH_SETTING_KEYS.activationMethod)
  const min = read(AUTH_SETTING_KEYS.usernameMin)
  const max = read(AUTH_SETTING_KEYS.usernameMax)

  const usernameMin = positiveInteger(min) ?? base.usernameMin
  const usernameMax = positiveInteger(max) ?? base.usernameMax
  const impossible = usernameMin > usernameMax

  return {
    activationMethod:
      typeof method === 'string' &&
      (ACTIVATION_METHODS as readonly string[]).includes(method)
        ? (method as AuthConfig['activationMethod'])
        : base.activationMethod,
    minPasswordLength:
      positiveInteger(read(AUTH_SETTING_KEYS.minPasswordLength)) ?? base.minPasswordLength,
    usernameMin: impossible ? base.usernameMin : usernameMin,
    usernameMax: impossible ? base.usernameMax : usernameMax,
  }
}

/** A stored number that could be a length. Null for anything else. */
function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}
