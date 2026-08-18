import { buttonVariants, Card, CardContent } from '@meith/ui'

import { type Copy, fromCopy } from './copy-record'

export function OfflineNotice({ message, copy }: { message: string; copy: Copy }) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="flex min-h-screen flex-1 items-center justify-center px-6 py-12"
    >
      <Card className="w-full max-w-lg">
        <CardContent className="p-6">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {fromCopy(copy, 'offline.kicker')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
            {fromCopy(copy, 'offline.title')}
          </h1>
          <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{message}</p>

          <a href="/login" className={`mt-5 ${buttonVariants({ variant: 'primary' })}`}>
            {fromCopy(copy, 'offline.logIn')}
          </a>
        </CardContent>
      </Card>
    </main>
  )
}
