import type { AuthEventKind } from '@meith/accounts'

const LABELS: Readonly<Record<AuthEventKind, string>> = {
  login: 'Signed in',
  login_failed: 'A sign-in was refused',
  logout: 'Signed out',
  second_factor_failed: 'A wrong two-factor code was given',
  second_factor_enabled: 'Two-factor authentication turned on',
  second_factor_disabled: 'Two-factor authentication turned off',
  recovery_code_used: 'A recovery code was used to sign in',
  recovery_codes_replaced: 'Recovery codes replaced',
  password_changed: 'Password changed',
  password_reset: 'Password reset',
  email_change_requested: 'An e-mail change was requested',
  email_changed: 'E-mail address changed',
  session_revoked: 'A session was signed out',
  sessions_revoked: 'Every other session was signed out',
  identity_linked: 'A sign-in provider was linked',
  identity_unlinked: 'A sign-in provider was unlinked',
  passkey_added: 'A passkey was added',
  passkey_removed: 'A passkey was removed',
}

export function authEventLabel(kind: string): string {
  return LABELS[kind as AuthEventKind] ?? kind.replace(/_/g, ' ')
}

/**
 * Enough of a user-agent string for a member to tell one of their own devices
 * from another, and no more: the full string is a fingerprint, and this is a
 * page whose job is recognition, not identification.
 */
export function describeDevice(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === '') return 'Unknown device'

  const platform =
    firstMatch(userAgent, [
      [/Windows NT/i, 'Windows'],
      [/Android/i, 'Android'],
      [/iPhone/i, 'iPhone'],
      [/iPad/i, 'iPad'],
      [/Mac OS X|Macintosh/i, 'Mac'],
      [/CrOS/i, 'ChromeOS'],
      [/Linux/i, 'Linux'],
    ]) ?? 'Unknown device'

  const browser = firstMatch(userAgent, [
    [/Edg\//i, 'Edge'],
    [/OPR\/|Opera/i, 'Opera'],
    [/Firefox\//i, 'Firefox'],
    [/Chrome\//i, 'Chrome'],
    [/Safari\//i, 'Safari'],
  ])

  return browser === null ? platform : `${browser} on ${platform}`
}

function firstMatch(
  value: string,
  table: readonly (readonly [RegExp, string])[],
): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(value)) return label
  }
  return null
}

export function describeAddress(ipPrefix: string | null): string {
  return ipPrefix === null || ipPrefix.trim() === '' ? 'address not recorded' : ipPrefix
}
