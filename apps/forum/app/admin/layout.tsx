import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ADMIN_IDLE_MINUTES } from '@meith/admin'

import { AdminNav } from '@/components/admin/admin-nav'
import { AdminSignInForm, AdminSignOutForm } from '@/components/admin/admin-forms'
import { resolveAdmin } from '@/server/admin'

export const metadata: Metadata = { title: 'Control panel' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const resolved = await resolveAdmin()

  if ('denied' in resolved) {
    if (resolved.denied === 'address' || resolved.denied === 'permission') notFound()
    if (resolved.denied === 'unavailable') notFound()

    return (
      <main
        id="board-content"
        tabIndex={-1}
        className="flex min-h-screen items-center justify-center px-6 py-12"
      >
        <AdminSignInForm next="/admin" reason="expired" idleMinutes={ADMIN_IDLE_MINUTES} />
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      { }
      <a
        href="#board-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-9 focus-visible:items-center focus-visible:rounded-md focus-visible:border focus-visible:border-border focus-visible:bg-card focus-visible:px-3 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-lg"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-card">
        { }
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <a
            href="/admin"
            className="font-serif text-lg font-semibold whitespace-nowrap text-foreground"
          >
            Control panel
          </a>
          { }
          <div className="ml-auto flex items-center gap-4 text-sm whitespace-nowrap">
            <a href="/" className="text-muted-foreground hover:text-foreground">
              The board
            </a>
            <AdminSignOutForm />
          </div>
        </div>
      </header>

      {resolved.context.needsReauth && (
        <p className="border-b border-border bg-muted px-6 py-2 text-center text-xs text-muted-foreground">
          It has been a while since you confirmed your password. Anything destructive will ask
          again.
        </p>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-col lg:flex-row">
        { }
        <aside className="px-6 pt-6 lg:sticky lg:top-14 lg:w-60 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0">
          <AdminNav />
        </aside>

        { }
        <main id="board-content" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
