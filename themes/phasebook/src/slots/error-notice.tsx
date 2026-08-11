import type { ErrorNoticeModel } from '@meith/theme-kit'

import { NUMERIC, PILL_PRIMARY } from '../shared'

export function ErrorNotice({ status, title, message, homeHref, requestId }: ErrorNoticeModel) {
  return (
    <section className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
      <div className="px-5 py-6">
        <p className={`text-xs font-semibold text-destructive ${NUMERIC}`}>Error {status}</p>

        <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <a href={homeHref} className={`mt-5 ${PILL_PRIMARY}`}>
          Forum home
        </a>
      </div>

      {requestId !== null && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Quote this if you report it:{' '}
          <code className="font-mono text-foreground select-all">{requestId}</code>
        </p>
      )}
    </section>
  )
}
