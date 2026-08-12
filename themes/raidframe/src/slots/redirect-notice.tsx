import type { RedirectNoticeModel } from '@meith/theme-kit'

import { BUTTON_PRIMARY, Frame, HEADING, MICRO, NUMERIC } from '../shared'

export function RedirectNotice({ message, targetHref, delaySeconds }: RedirectNoticeModel) {
  return (
    <Frame className="w-full max-w-lg">
      <div className="px-5 py-5">
        <p className={`${MICRO} text-primary`}>loading</p>
        <h1 className={`${HEADING} mt-1 text-2xl text-foreground`}>Standing by</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={targetHref} className={BUTTON_PRIMARY}>
            continue now
          </a>
          <span className={`${MICRO} normal-case`}>
            <span className="uppercase">auto in</span>{' '}
            <span className={NUMERIC}>{delaySeconds}</span>s
          </span>
        </div>
      </div>
    </Frame>
  )
}
