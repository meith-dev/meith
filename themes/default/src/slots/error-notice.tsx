import { Card, CardContent, CardFooter, buttonVariants } from '@meith/ui'
import type { ErrorNoticeModel } from '@meith/theme-kit'

import { NUMERIC } from '../shared'

/**
 * The themed body of an error or not-found page (F34).
 *
 * **It must not depend on the database**: this is what renders when the database
 * is the thing that failed. Which is also why nothing here reaches for a token
 * that only the runtime override supplies — every colour is a compiled default,
 * so an error page paints correctly even when the request that would have
 * fetched the board's palette is the request that broke.
 *
 * The request id is the whole point of the footer. An error a member can quote a
 * reference for is an error an operator can find in the log; without one, the
 * report is "it broke earlier" and the log is an hour of everybody's traffic. So
 * it is monospaced and selectable rather than tucked into small print — somebody
 * is going to copy it into a message.
 */
export function ErrorNotice({ status, title, message, homeHref, requestId }: ErrorNoticeModel) {
  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6">
        <p className={`text-xs font-medium tracking-wide text-destructive uppercase ${NUMERIC}`}>
          Error {status}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
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
