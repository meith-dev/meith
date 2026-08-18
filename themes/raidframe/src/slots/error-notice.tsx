import type { ErrorNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { BUTTON_PRIMARY, Frame, HEADING, MICRO, NUMERIC } from '../shared'

export function ErrorNotice({
  status,
  title,
  message,
  homeHref,
  requestId,
  copy,
}: ErrorNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.errorNotice.${key}`)

  return (
    <Frame className="w-full max-w-lg">
      <div className="px-5 py-5">
        <p className={`${MICRO} ${NUMERIC} text-destructive`}>
          {c('errorLabel')} {status}
        </p>
        <h1 className={`${HEADING} mt-1 text-2xl text-foreground`}>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <a href={homeHref} className={`${BUTTON_PRIMARY} mt-5`}>
          {c('forumHome')}
        </a>
      </div>

      {requestId !== null && (
        <p className={`${MICRO} border-t border-border px-5 py-2 normal-case`}>
          <span className="uppercase">{c('requestId')}</span>{' '}
          <code className={`${NUMERIC} text-foreground select-all`}>{requestId}</code>
        </p>
      )}
    </Frame>
  )
}
