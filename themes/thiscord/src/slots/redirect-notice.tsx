import type { RedirectNoticeModel } from '@meith/theme-kit'

import { BTN_PRIMARY, NUMERIC, PANEL } from '../shared'

export function RedirectNotice({ message, targetHref, delaySeconds }: RedirectNoticeModel) {
  return (
    <section className={`${PANEL} w-full max-w-lg px-5 py-6`}>
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Redirecting</p>
      <h1 className="mt-1 text-xl leading-tight font-bold tracking-tight">Please wait</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a href={targetHref} className={BTN_PRIMARY}>
          Continue now
        </a>
        <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
          Continuing on its own in {delaySeconds} {delaySeconds === 1 ? 'second' : 'seconds'}.
        </span>
      </div>
    </section>
  )
}
