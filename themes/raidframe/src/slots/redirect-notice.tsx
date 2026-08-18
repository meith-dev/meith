import type { RedirectNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { BUTTON_PRIMARY, Frame, HEADING, MICRO, NUMERIC } from '../shared'

export function RedirectNotice({
  message,
  targetHref,
  delaySeconds,
  copy,
}: RedirectNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.redirectNotice.${key}`)

  return (
    <Frame className="w-full max-w-lg">
      <div className="px-5 py-5">
        <p className={`${MICRO} text-primary`}>{c('kicker')}</p>
        <h1 className={`${HEADING} mt-1 text-2xl text-foreground`}>{c('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={targetHref} className={BUTTON_PRIMARY}>
            {c('continueNow')}
          </a>
          <span className={`${MICRO} normal-case`}>
            <span className="uppercase">{c('continuingIn')}</span>{' '}
            <span className={NUMERIC}>{delaySeconds}</span>{' '}
            {delaySeconds === 1 ? c('second.one') : c('second.other')}
          </span>
        </div>
      </div>
    </Frame>
  )
}
