import { Card, CardContent, CardFooter, buttonVariants } from '@meith/ui'
import type { ErrorNoticeModel } from '@meith/theme-kit'

import { NUMERIC } from '../shared'

export function ErrorNotice({ status, title, message, homeHref, requestId }: ErrorNoticeModel) {
  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6">
        <p className={`text-xs font-medium tracking-wide text-destructive uppercase ${NUMERIC}`}>
          Error {status}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <a href={homeHref} className={`mt-5 ${buttonVariants({ variant: 'primary' })}`}>
          Forum home
        </a>
      </CardContent>

      {requestId !== null && (
        <CardFooter>
          <span>
            Quote this if you report it:{' '}
            <code className="font-mono text-foreground select-all">{requestId}</code>
          </span>
        </CardFooter>
      )}
    </Card>
  )
}
