import type { Translator } from '@meith/i18n'
import type { ErrorNoticeModel } from '@meith/theme-kit'

import { untranslated } from './time'

export interface ErrorNoticeCopy {
  readonly status: number
  readonly titleKey: string
  readonly messageKey: string
}

export const NOT_FOUND_NOTICE: ErrorNoticeCopy = {
  status: 404,
  titleKey: 'errorNotice.notFound.title',
  messageKey: 'errorNotice.notFound.message',
}

export const CRASH_NOTICE_STATUS = 500

export const CRASH_NOTICE: ErrorNoticeCopy = {
  status: CRASH_NOTICE_STATUS,
  titleKey: 'errorNotice.crash.title',
  messageKey: 'errorNotice.crash.message',
}

export interface CrashNoticeCopy {
  readonly title: string
  readonly message: string
  readonly homeLabel: string
}

export function crashNoticeCopy(t: Translator = untranslated()): CrashNoticeCopy {
  return {
    title: t.t(CRASH_NOTICE.titleKey),
    message: t.t(CRASH_NOTICE.messageKey),
    homeLabel: t.t('errorNotice.home'),
  }
}

export function buildErrorNotice(
  copy: ErrorNoticeCopy,
  requestId: string | null,
  t: Translator = untranslated(),
): ErrorNoticeModel {
  return {
    status: copy.status,
    title: t.t(copy.titleKey),
    message: t.t(copy.messageKey),
    homeHref: '/',
    requestId,
  }
}
