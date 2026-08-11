import type { ErrorNoticeModel } from '@meith/theme-kit'

import { BTN_PRIMARY, NUMERIC, PANEL } from '../shared'

export function ErrorNotice({ status, title, message, homeHref, requestId }: ErrorNoticeModel) {
  return (
    <section className={`${PANEL} w-full max-w-lg overflow-hidden border-l-4 border-l-destructive`}>
      <div className="px-5 py-6">
        <p className={`text-xs font-bold tracking-wide text-destructive uppercase ${NUMERIC}`}>
          Error {status}
        </p>
        <h1 className="mt-1 text-xl leading-tight font-bold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <a href={homeHref} className={`mt-5 ${BTN_PRIMARY}`}>
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
