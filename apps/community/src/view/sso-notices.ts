import type { ErrorCode } from '@meith/core'

export type SsoNoticeKind = 'info' | 'warning'

export interface SsoNotice {
  readonly kind: SsoNoticeKind
  readonly message: string
}

const NOTICES: Readonly<Record<string, SsoNotice>> = {
  linked: {
    kind: 'info',
    message: 'That sign-in is now linked to your account.',
  },
  unlinked: {
    kind: 'info',
    message: 'That sign-in has been unlinked. It can no longer reach your account.',
  },
  approval: {
    kind: 'info',
    message:
      'Your account has been created. An administrator reviews new members here, so you ' +
      'cannot sign in until that has happened.',
  },
  expired: {
    kind: 'warning',
    message:
      'That sign-in attempt had expired by the time it came back, so nothing was done. ' +
      'Start it again from this page.',
  },
  refused: {
    kind: 'warning',
    message: 'The sign-in was cancelled, so nothing changed here.',
  },
  off: {
    kind: 'warning',
    message: 'That way of signing in is not switched on for this board.',
  },
  conflict: {
    kind: 'warning',
    message:
      'An account here already claims that identity. Sign in the way you did before and ' +
      'manage the link from your account security page.',
  },
  forbidden: {
    kind: 'warning',
    message:
      'That sign-in cannot open an account here. If you already have one, sign in with ' +
      'your password and link the two from your account security page.',
  },
  invalid: {
    kind: 'warning',
    message:
      'The provider did not send enough to open an account with — a confirmed e-mail ' +
      'address, at least. Register with a password instead.',
  },
  slowdown: {
    kind: 'warning',
    message: 'Too many accounts have been opened from your connection. Try again later.',
  },
  failed: {
    kind: 'warning',
    message: 'That sign-in did not complete. Nothing changed here, so it is safe to retry.',
  },
}

export function ssoNotice(code: string | undefined): SsoNotice | null {
  if (code === undefined) return null
  return NOTICES[code] ?? NOTICES.failed ?? null
}

export function ssoOutcomeCode(error: ErrorCode | null): string {
  if (error === 'CONFLICT') return 'conflict'
  if (error === 'FORBIDDEN') return 'forbidden'
  if (error === 'VALIDATION') return 'invalid'
  if (error === 'RATE_LIMITED') return 'slowdown'
  return 'failed'
}
