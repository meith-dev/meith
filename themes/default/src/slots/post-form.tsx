import { Alert, AlertDescription, AlertTitle, Card } from '@meith/ui'
import type { PostFormModel } from '@meith/theme-kit'

import { MUTED_LINK, pageAt } from '../shared'

export function PostForm({
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
}: PostFormModel) {
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
            <AlertTitle>Cannot post.</AlertTitle> {errorMessage}
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
