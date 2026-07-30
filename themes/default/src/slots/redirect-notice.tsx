import type { RedirectNoticeModel } from '@forum/theme-kit'

export function RedirectNotice({ message, targetHref, delaySeconds }: RedirectNoticeModel) {
  return (
    <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground">
      <p className="text-sm font-medium text-primary">Redirecting</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold">Please wait</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <p className="mt-5 text-sm text-muted-foreground">
        Continuing in {delaySeconds} seconds.{' '}
        <a href={targetHref} className="font-medium text-foreground hover:text-primary">Continue now</a>
      </p>
    </section>
  )
}
