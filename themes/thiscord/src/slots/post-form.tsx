import type { PostFormModel } from '@meith/theme-kit'

import { BTN, COLUMN, PAGE, PANEL } from '../shared'

export function PostForm({
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
}: PostFormModel) {
  return (
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div className={`${COLUMN} flex flex-col gap-4`}>
        {errorMessage !== null && (
          <p
            role="alert"
            className={`${PANEL} border-l-4 border-l-destructive px-4 py-3 text-sm`}
          >
            <span className="font-bold text-destructive">Cannot post</span>{' '}
            <span className="text-muted-foreground">— {errorMessage}</span>
          </p>
        )}

        <section className={`${PANEL} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h1 className="text-base leading-tight font-bold tracking-tight text-balance">
              {heading}
            </h1>
            <a href={cancelHref} className={BTN}>
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
