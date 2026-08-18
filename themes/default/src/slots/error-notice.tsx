import type { ErrorNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { buttonVariants, Card, CardContent, CardFooter } from '@meith/ui'

import { NUMERIC } from '../shared'

export function ErrorNotice({
  status,
  title,
  message,
  homeHref,
  requestId,
  copy,
}: ErrorNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.errorNotice.${key}`)

  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6">
        <p className={`text-xs font-medium tracking-wide text-destructive uppercase ${NUMERIC}`}>
          {c('error')} {status}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <a href={homeHref} className={`mt-5 ${buttonVariants({ variant: 'primary' })}`}>
          {c('forumHome')}
        </a>
      </CardContent>

      {requestId !== null && (
        <CardFooter>
          <span>
            {c('quoteThis')}{' '}
            <code className="font-mono text-foreground select-all">{requestId}</code>
          </span>
        </CardFooter>
      )}
    </Card>
  )
}
