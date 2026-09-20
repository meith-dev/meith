import type { ErrorNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  Action,
  EDITORIAL_RULE,
  Label,
  LEDE,
  NUMERIC,
  PAGE_TITLE,
  RULE,
  SMALL_PRINT,
} from '../shared'

export function ErrorNotice({
  status,
  title,
  message,
  homeHref,
  requestId,
  copy,
}: ErrorNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.errorNotice.${key}`)

  return (
    <div className={`${EDITORIAL_RULE} flex w-full max-w-lg flex-col gap-5 pt-4`}>
      <Label className={NUMERIC}>
        {c('error')} {status}
      </Label>
      <h1 className={PAGE_TITLE}>{title}</h1>
      <p className={LEDE}>{message}</p>

      <div>
        <Action href={homeHref}>{c('forumHome')}</Action>
      </div>

      {requestId !== null && (
        <p className={`${RULE} pt-4 ${SMALL_PRINT}`}>
          {c('quoteThis')}{' '}
          <code className={`${NUMERIC} text-foreground select-all`}>{requestId}</code>
        </p>
      )}
    </div>
  )
}
