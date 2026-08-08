import type { RedirectNoticeModel } from '@meith/theme-kit'

export const REDIRECT_DELAY_SECONDS = 2

function localHref(value: string | undefined): string {
  if (value === undefined || !value.startsWith('/')) return '/'
  const origin = 'https://community.invalid'
  const url = new URL(value, origin)
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/'
}

export function buildRedirectNotice(
  target: string | undefined,
  message: string | undefined,
): RedirectNoticeModel {
  return {
    targetHref: localHref(target),
    message: message?.trim() || 'Continuing…',
    delaySeconds: REDIRECT_DELAY_SECONDS,
  }
}
