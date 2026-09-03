import type { PostFormModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Alert, AlertDescription, AlertTitle, buttonVariants, Card, cn } from '@meith/ui'

import { PAGE_TITLE, pageAt } from '../shared'

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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className={PAGE_TITLE}>{heading}</h1>
        <a href={cancelHref} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
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

      <Card className="rounded-xl">
        {regions.toolbar}
        <div className="p-4 sm:p-6">{regions.form}</div>
      </Card>
    </div>
  )
}
