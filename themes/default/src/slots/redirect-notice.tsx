import { Card, CardContent, buttonVariants } from '@meith/ui'
import type { RedirectNoticeModel } from '@meith/theme-kit'

/**
 * The MyBB-style interstitial (F34): "your post was made, continuing in a
 * moment".
 *
 * The link is the reason this page exists. The meta refresh that the route sets
 * does not carry everybody — a browser with refresh disabled, a screen reader
 * that has already begun reading the page, anyone whose connection stalls past
 * the delay — and for all of them this is a page with a message and no exit
 * unless the exit is a real anchor.
 *
 * So "Continue now" is the primary control, not a footnote after the countdown.
 * The delay is stated as text beside it rather than counted down: a live counter
 * is a client component, and a number that ticks is a number a screen reader
 * re-reads every second.
 */
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
