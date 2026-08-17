import type { AuthEventKind } from '@meith/accounts'
import type { Translator } from '@meith/i18n'

import { untranslated } from './time'

const LABEL_KEYS: Readonly<Record<AuthEventKind, string>> = {
  login: 'authEvent.login',
  login_failed: 'authEvent.login_failed',
  logout: 'authEvent.logout',
  second_factor_failed: 'authEvent.second_factor_failed',
  second_factor_enabled: 'authEvent.second_factor_enabled',
  second_factor_disabled: 'authEvent.second_factor_disabled',
  recovery_code_used: 'authEvent.recovery_code_used',
  recovery_codes_replaced: 'authEvent.recovery_codes_replaced',
  password_changed: 'authEvent.password_changed',
  password_reset: 'authEvent.password_reset',
  email_change_requested: 'authEvent.email_change_requested',
  email_changed: 'authEvent.email_changed',
  session_revoked: 'authEvent.session_revoked',
  sessions_revoked: 'authEvent.sessions_revoked',
  identity_linked: 'authEvent.identity_linked',
  identity_unlinked: 'authEvent.identity_unlinked',
  passkey_added: 'authEvent.passkey_added',
  passkey_removed: 'authEvent.passkey_removed',
}

export function authEventLabel(kind: string, t: Translator = untranslated()): string {
  const key = LABEL_KEYS[kind as AuthEventKind]
  return key === undefined ? kind.replace(/_/g, ' ') : t.t(key)
}

/**
 * Enough of a user-agent string for a member to tell one of their own devices
 * from another, and no more: the full string is a fingerprint, and this is a
 * page whose job is recognition, not identification.
 */
export function describeDevice(userAgent: string | null, t: Translator = untranslated()): string {
  const unknown = t.t('device.unknown')
  if (userAgent === null || userAgent.trim() === '') return unknown

  const platform =
    firstMatch(userAgent, [
      [/Windows NT/i, 'Windows'],
      [/Android/i, 'Android'],
      [/iPhone/i, 'iPhone'],
      [/iPad/i, 'iPad'],
      [/Mac OS X|Macintosh/i, 'Mac'],
      [/CrOS/i, 'ChromeOS'],
      [/Linux/i, 'Linux'],
    ]) ?? unknown

  const browser = firstMatch(userAgent, [
    [/Edg\//i, 'Edge'],
    [/OPR\/|Opera/i, 'Opera'],
    [/Firefox\//i, 'Firefox'],
    [/Chrome\//i, 'Chrome'],
    [/Safari\//i, 'Safari'],
  ])

  return browser === null ? platform : `${browser} on ${platform}`
}

function firstMatch(value: string, table: readonly (readonly [RegExp, string])[]): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(value)) return label
  }
  return null
}

export function describeAddress(ipPrefix: string | null): string {
  return ipPrefix === null || ipPrefix.trim() === '' ? 'address not recorded' : ipPrefix
}
