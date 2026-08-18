import type { RedirectNoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { buttonVariants, Card, CardContent } from '@meith/ui'

export function RedirectNotice({
  message,
  targetHref,
  delaySeconds,
  copy,
}: RedirectNoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.redirectNotice.${key}`)

  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {c('redirecting')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c('pleaseWait')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={targetHref} className={buttonVariants({ variant: 'primary' })}>
            {c('continueNow')}
          </a>
          <span className="text-xs text-muted-foreground">
            {c('continuingOnItsOwnIn')} {delaySeconds}{' '}
            {delaySeconds === 1 ? c('second.one') : c('second.other')}.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
