import type { ErrorCode } from '@meith/core'
import type { Translator } from '@meith/i18n'

import { untranslated } from './time'

export type SsoNoticeKind = 'info' | 'warning'

export interface SsoNotice {
  readonly kind: SsoNoticeKind
  readonly messageKey: string
}

export interface SsoNoticeCopy {
  readonly kind: SsoNoticeKind
  readonly message: string
}

const NOTICES: Readonly<Record<string, SsoNotice>> = {
  linked: { kind: 'info', messageKey: 'sso.linked' },
  unlinked: { kind: 'info', messageKey: 'sso.unlinked' },
  approval: { kind: 'info', messageKey: 'sso.approval' },
  expired: { kind: 'warning', messageKey: 'sso.expired' },
  refused: { kind: 'warning', messageKey: 'sso.refused' },
  off: { kind: 'warning', messageKey: 'sso.off' },
  conflict: { kind: 'warning', messageKey: 'sso.conflict' },
  forbidden: { kind: 'warning', messageKey: 'sso.forbidden' },
  invalid: { kind: 'warning', messageKey: 'sso.invalid' },
  slowdown: { kind: 'warning', messageKey: 'sso.slowdown' },
  failed: { kind: 'warning', messageKey: 'sso.failed' },
}

export function ssoNotice(
  code: string | undefined,
  t: Translator = untranslated(),
): SsoNoticeCopy | null {
  if (code === undefined) return null

  const notice = NOTICES[code] ?? NOTICES.failed
  return notice === undefined ? null : { kind: notice.kind, message: t.t(notice.messageKey) }
}

export function ssoOutcomeCode(error: ErrorCode | null): string {
  if (error === 'CONFLICT') return 'conflict'
  if (error === 'FORBIDDEN') return 'forbidden'
  if (error === 'VALIDATION') return 'invalid'
  if (error === 'RATE_LIMITED') return 'slowdown'
  return 'failed'
}
