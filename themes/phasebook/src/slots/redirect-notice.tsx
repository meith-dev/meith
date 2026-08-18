import type { RedirectNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { NUMERIC, PILL_PRIMARY } from '../shared'

export function RedirectNotice({
  message,
  targetHref,
  delaySeconds,
  copy,
}: RedirectNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.redirectNotice.${key}`)

  return (
    <section className="w-full max-w-lg rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
      <div className="px-5 py-6">
        <p className="text-xs font-semibold text-muted-foreground">{c('redirecting')}</p>
        <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight">{c('pleaseWait')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={targetHref} className={PILL_PRIMARY}>
            {c('continueNow')}
          </a>
          <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
            {c('continuing')} {delaySeconds}{' '}
            {delaySeconds === 1 ? c('second.one') : c('second.other')}.
          </span>
        </div>
      </div>
    </section>
  )
}
