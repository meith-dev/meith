import type { PostFormModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { EDITORIAL_RULE, LABEL, PAGE_TITLE, QUIET_LINK, SHELL, TOUCH } from '../shared'

export function PostForm({
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
  copy,
}: PostFormModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.postForm.${key}`)

  return (
    <div className={`${SHELL} flex w-full max-w-3xl flex-col gap-6 py-8 sm:py-10`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className={PAGE_TITLE}>{heading}</h1>
        <a href={cancelHref} className={`${LABEL} inline-flex items-center ${QUIET_LINK} ${TOUCH}`}>
          {cancelLabel}
        </a>
      </div>

      {errorMessage !== null && (
        <p
          role="alert"
          className="border border-border border-l-4 border-l-foreground px-4 py-3 text-[0.9375rem] leading-relaxed text-foreground"
        >
          <span className={`${LABEL} me-3`}>{c('cannotPost')}</span>
          {errorMessage}
        </p>
      )}

      <div className={EDITORIAL_RULE}>
        {regions.toolbar}
        <div className="pt-5">{regions.form}</div>
      </div>
    </div>
  )
}
