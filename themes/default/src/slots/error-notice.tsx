import type { ErrorNoticeModel } from '@meith/theme-kit'

export function ErrorNotice({ status, title, message, homeHref, requestId }: ErrorNoticeModel) {
  return (
    <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground">
      <p className="text-sm font-medium text-destructive">Error {status}</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {requestId !== null && <p className="mt-3 text-xs text-muted-foreground">Request ID: {requestId}</p>}
      <a href={homeHref} className="mt-5 inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Forum home</a>
    </section>
  )
}
