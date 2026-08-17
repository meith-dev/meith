import type { ErrorNoticeModel } from '@meith/theme-kit'

export interface ErrorNoticeCopy {
  readonly status: number
  readonly title: string
  readonly message: string
}

export const NOT_FOUND_NOTICE: ErrorNoticeCopy = {
  status: 404,
  title: 'Page not found',
  message: 'The page you requested does not exist or is no longer available.',
}

export const CRASH_NOTICE: ErrorNoticeCopy = {
  status: 500,
  title: 'Something went wrong',
  message: 'The board could not finish this page. Try again, or return to the forum.',
}

export function buildErrorNotice(
  copy: ErrorNoticeCopy,
  requestId: string | null,
): ErrorNoticeModel {
  return { ...copy, homeHref: '/', requestId }
}
