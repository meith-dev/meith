'use client'

/**
 * Next error boundaries must be client components, so this cannot resolve the
 * server-rendered ErrorNotice slot. It deliberately avoids error details and
 * the database, which are both unsafe while handling a failure.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="board-content" tabIndex={-1} className="flex min-h-dvh items-center justify-center px-6 py-12">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground">
        <p className="text-sm font-medium text-destructive">Error</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please try again, or return to the community.</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={reset} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Try again</button>
          <a href="/" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">Community home</a>
        </div>
      </section>
    </main>
  )
}
