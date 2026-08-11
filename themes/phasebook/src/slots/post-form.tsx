import type { PostFormModel } from '@meith/theme-kit'

import { FEED, PAGE, PILL } from '../shared'

export function PostForm({
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
}: PostFormModel) {
  return (
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div className={`${FEED} flex flex-col gap-4`}>
        {errorMessage !== null && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm shadow-elevation"
          >
            <span className="font-semibold">Cannot post.</span> {errorMessage}
          </p>
        )}

        <section className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h1 className="text-lg leading-tight font-bold tracking-tight text-balance">
              {heading}
            </h1>
            <a href={cancelHref} className={PILL}>
              {cancelLabel}
            </a>
          </div>

          {regions.toolbar}

          <div className="px-4 py-4">{regions.form}</div>
        </section>
      </div>
    </div>
  )
}
