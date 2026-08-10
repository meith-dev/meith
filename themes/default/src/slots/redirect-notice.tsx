import { Card, CardContent, buttonVariants } from '@meith/ui'
import type { RedirectNoticeModel } from '@meith/theme-kit'

export function RedirectNotice({ message, targetHref, delaySeconds }: RedirectNoticeModel) {
  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Redirecting
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Please wait</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={targetHref} className={buttonVariants({ variant: 'primary' })}>
            Continue now
          </a>
          <span className="text-xs text-muted-foreground">
            Continuing on its own in {delaySeconds} {delaySeconds === 1 ? 'second' : 'seconds'}.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
