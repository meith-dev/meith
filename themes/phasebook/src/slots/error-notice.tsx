import type { ErrorNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { NUMERIC, PILL_PRIMARY } from '../shared'

export function ErrorNotice({
  status,
  title,
  message,
  homeHref,
  requestId,
  copy,
}: ErrorNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.errorNotice.${key}`)

  return (
    <section className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
      <div className="px-5 py-6">
        <p className={`text-xs font-semibold text-destructive ${NUMERIC}`}>
          {c('error')} {status}
        </p>

        <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <a href={homeHref} className={`mt-5 ${PILL_PRIMARY}`}>
          {c('home')}
        </a>
      </div>

      {requestId !== null && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {c('quote')} <code className="font-mono text-foreground select-all">{requestId}</code>
        </p>
      )}
    </section>
  )
}
