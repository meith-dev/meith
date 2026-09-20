import type { RedirectNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Action, EDITORIAL_RULE, Label, LEDE, NUMERIC, PAGE_TITLE, SMALL_PRINT } from '../shared'

export function RedirectNotice({
  message,
  targetHref,
  delaySeconds,
  copy,
}: RedirectNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.redirectNotice.${key}`)

  return (
    <div className={`${EDITORIAL_RULE} flex w-full max-w-lg flex-col gap-5 pt-4`}>
      <Label>{c('redirecting')}</Label>
      <h1 className={PAGE_TITLE}>{c('pleaseWait')}</h1>
      <p className={LEDE}>{message}</p>

      <div className="flex flex-wrap items-center gap-5">
        <Action href={targetHref}>{c('continueNow')}</Action>
        <span className={`${SMALL_PRINT} ${NUMERIC}`}>
          {c('continuingOnItsOwnIn')} {delaySeconds}{' '}
          {delaySeconds === 1 ? c('second.one') : c('second.other')}.
        </span>
      </div>
    </div>
  )
}
