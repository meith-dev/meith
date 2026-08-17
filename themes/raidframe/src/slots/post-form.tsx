import type { PostFormModel } from '@meith/theme-kit'

import { BUTTON, HEADING, MICRO, RULE } from '../shared'

export function PostForm({
  mode,
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
}: PostFormModel) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      {errorMessage !== null && (
        <p
          role="alert"
          className="border border-l-[3px] border-border border-l-destructive bg-card px-3 py-2 text-sm"
        >
          <span className={`${MICRO} mr-2 text-destructive`}>cannot post</span>
          {errorMessage}
        </p>
      )}

      <section className="border border-border bg-card shadow-elevation">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className={MICRO}>
              {mode === 'edit' ? 'edit' : mode === 'reply' ? 'reply' : 'new thread'}
            </p>
            <h1 className={`${HEADING} text-lg text-foreground`}>{heading}</h1>
          </div>
          <a href={cancelHref} className={BUTTON}>
            {cancelLabel}
          </a>
        </div>

        <div className={RULE} aria-hidden="true" />

        {regions.toolbar}

        <div className="px-4 py-4">{regions.form}</div>
      </section>
    </div>
  )
}
