import type { Translator } from '@meith/i18n'
import type { RedirectNoticeModel } from '@meith/theme-kit'

import { untranslated } from './time'

export const REDIRECT_DELAY_SECONDS = 2

const DEFAULT_MESSAGE_KEY = 'redirectNotice.continuing'

const REDIRECT_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  continuing: DEFAULT_MESSAGE_KEY,
  'signed-out': 'redirectNotice.signedOut',
  saved: 'redirectNotice.saved',
  posted: 'redirectNotice.posted',
}

export function localHref(value: string | undefined): string {
  if (value === undefined || !value.startsWith('/')) return '/'
  const origin = 'https://forum.invalid'
  const url = new URL(value, origin)
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/'
}

export function buildRedirectNotice(
  target: string | undefined,
  messageKey: string | undefined,
  t: Translator = untranslated(),
): RedirectNoticeModel {
  const key =
    (messageKey !== undefined ? REDIRECT_MESSAGE_KEYS[messageKey] : undefined) ??
    DEFAULT_MESSAGE_KEY

  return {
    targetHref: localHref(target),
    message: t.t(key),
    delaySeconds: REDIRECT_DELAY_SECONDS,
  }
}
