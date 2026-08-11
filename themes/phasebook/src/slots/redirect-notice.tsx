import type { RedirectNoticeModel } from '@meith/theme-kit'

import { NUMERIC, PILL_PRIMARY } from '../shared'

export function RedirectNotice({ message, targetHref, delaySeconds }: RedirectNoticeModel) {
  return (
    <section className="w-full max-w-lg rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
      <div className="px-5 py-6">
        <p className="text-xs font-semibold text-muted-foreground">Redirecting</p>
        <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight">Please wait</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={targetHref} className={PILL_PRIMARY}>
            Continue now
          </a>
          <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
            Continuing on its own in {delaySeconds} {delaySeconds === 1 ? 'second' : 'seconds'}.
          </span>
        </div>
      </div>
    </section>
  )
}
