import type { ErrorNoticeModel } from '@meith/theme-kit'

import { BUTTON_PRIMARY, Frame, HEADING, MICRO, NUMERIC } from '../shared'

export function ErrorNotice({ status, title, message, homeHref, requestId }: ErrorNoticeModel) {
  return (
    <Frame className="w-full max-w-lg">
      <div className="px-5 py-5">
        <p className={`${MICRO} ${NUMERIC} text-destructive`}>connection lost — {status}</p>
        <h1 className={`${HEADING} mt-1 text-2xl text-foreground`}>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <a href={homeHref} className={`${BUTTON_PRIMARY} mt-5`}>
          return to base
        </a>
      </div>

      {requestId !== null && (
        <p className={`${MICRO} border-t border-border px-5 py-2 normal-case`}>
          <span className="uppercase">trace</span>{' '}
          <code className={`${NUMERIC} text-foreground select-all`}>{requestId}</code>
        </p>
      )}
    </Frame>
  )
}
