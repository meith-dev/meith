import type { PostFormModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Alert, AlertDescription, AlertTitle, Card } from '@meith/ui'

import { MUTED_LINK, pageAt } from '../shared'

export function PostForm({
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
  copy,
}: PostFormModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.postForm.${key}`)

  return (
    <div className={`${pageAt('max-w-3xl')} flex w-full flex-col gap-5 py-6 sm:py-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{heading}</h1>
        <a href={cancelHref} className={`text-sm ${MUTED_LINK}`}>
          {cancelLabel}
        </a>
      </div>

      {errorMessage !== null && (
        <Alert tone="error">
          <AlertDescription>
            <AlertTitle>{c('cannotPost')}</AlertTitle> {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        {regions.toolbar}
        <div className="p-4 sm:p-5">{regions.form}</div>
      </Card>
    </div>
  )
}
