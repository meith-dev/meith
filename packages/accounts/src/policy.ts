import type { AuthConfig } from './ports'

export type AuthPolicy = Omit<AuthConfig, 'activationMethod' | 'defaultMemberGroupId'>

export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  registrationEnabled: true,
  minPasswordLength: 8,
  usernameMin: 3,
  usernameMax: 30,
  maxLoginAttempts: 5,
  maxAccountLoginAttempts: 50,
  lockoutMinutes: 15,
  sessionLifetimeDays: 14,
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
}

export const AUTH_SETTING_KEYS = {
  registrationEnabled: 'registration.enabled',
  activationMethod: 'registration.method',
  minPasswordLength: 'registration.min_password_length',
  usernameMin: 'registration.username_min',
  usernameMax: 'registration.username_max',
  maxLoginAttempts: 'security.max_login_attempts',
  maxAccountLoginAttempts: 'security.max_account_login_attempts',
  lockoutMinutes: 'security.lockout_minutes',
  sessionLifetimeDays: 'security.session_idle_days',
} as const

export type SettingReader = (key: string) => unknown

export interface ResolvedAuthSettings {
  readonly registrationEnabled: boolean
  readonly activationMethod: AuthConfig['activationMethod']
  readonly minPasswordLength: number
  readonly usernameMin: number
  readonly usernameMax: number
  readonly maxLoginAttempts: number
  readonly maxAccountLoginAttempts: number
  readonly lockoutMinutes: number
  readonly sessionLifetimeDays: number
}

const ACTIVATION_METHODS: readonly AuthConfig['activationMethod'][] = [
  'none',
  'email',
  'admin',
  'both',
]

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

  const enabled = read(AUTH_SETTING_KEYS.registrationEnabled)

  return {
    registrationEnabled:
      typeof enabled === 'boolean' ? enabled : base.registrationEnabled,
    activationMethod:
      typeof method === 'string' &&
      (ACTIVATION_METHODS as readonly string[]).includes(method)
        ? (method as AuthConfig['activationMethod'])
        : base.activationMethod,
    minPasswordLength:
      positiveInteger(read(AUTH_SETTING_KEYS.minPasswordLength)) ?? base.minPasswordLength,
    usernameMin: impossible ? base.usernameMin : usernameMin,
    usernameMax: impossible ? base.usernameMax : usernameMax,
    maxLoginAttempts:
      countingInteger(read(AUTH_SETTING_KEYS.maxLoginAttempts)) ?? base.maxLoginAttempts,
    maxAccountLoginAttempts:
      countingInteger(read(AUTH_SETTING_KEYS.maxAccountLoginAttempts)) ??
      base.maxAccountLoginAttempts,
    lockoutMinutes:
      positiveInteger(read(AUTH_SETTING_KEYS.lockoutMinutes)) ?? base.lockoutMinutes,
    sessionLifetimeDays:
      positiveInteger(read(AUTH_SETTING_KEYS.sessionLifetimeDays)) ?? base.sessionLifetimeDays,
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function countingInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}
