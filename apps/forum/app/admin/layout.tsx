import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ADMIN_IDLE_MINUTES } from '@forum/admin'

import { AdminSignInForm, AdminSignOutForm } from '@/components/admin/admin-forms'
import { resolveAdmin } from '@/server/admin'

export const metadata: Metadata = { title: 'Control panel' }

/**
 * F63 — the ACP shell.
 *
 * **Its own layout, outside `(board)`**, so the panel does not inherit the
 * board's header, theme slots or user panel. That is not cosmetic: the ACP is a
 * different surface with different authority, and a theme — which F68 lets an
 * administrator edit from inside this panel — must not be able to render the
 * screen that edits it.
 *
 * The gate runs here so that an unauthenticated navigation lands on the
 * password form rather than on a broken page. **Every page under it runs the
 * gate again**: a layout is not a security boundary in the App Router, since a
 * page can be requested directly as an RSC payload, and "the layout checked it"
 * is precisely the assumption that becomes a hole.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const resolved = await resolveAdmin()

  if ('denied' in resolved) {
    /*
     * Two of the four denials are answered with a 404 rather than a message.
     * An address outside the allowlist, and a member without `admincp.access`,
     * should not learn that there is a control panel here at all — the whole
     * value of the allowlist is that the panel is invisible from outside it.
     */
    if (resolved.denied === 'address' || resolved.denied === 'permission') notFound()
    if (resolved.denied === 'unavailable') notFound()

    return (
      <main id="board-content" tabIndex={-1} className="flex min-h-screen items-center justify-center px-6 py-12">
        <AdminSignInForm next="/admin" reason="expired" idleMinutes={ADMIN_IDLE_MINUTES} />
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <a href="/admin" className="font-serif text-lg font-semibold">
            Control panel
          </a>
          <nav aria-label="Control panel" className="flex flex-wrap items-center gap-4 text-sm">
            <a href="/admin/log" className="text-muted-foreground hover:text-foreground">
              Admin log
            </a>
            <a href="/" className="text-muted-foreground hover:text-foreground">
              Back to the board
            </a>
            <AdminSignOutForm />
          </nav>
        </div>
      </header>

      {resolved.context.needsReauth && (
        <p className="border-b border-border bg-muted px-6 py-2 text-center text-xs text-muted-foreground">
          It has been a while since you confirmed your password. Anything
          destructive will ask again.
        </p>
      )}

      <main id="board-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
