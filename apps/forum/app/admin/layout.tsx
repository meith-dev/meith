import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ADMIN_IDLE_MINUTES } from '@meith/admin'

import { AdminNav } from '@/components/admin/admin-nav'
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
 *
 * ## The shell is how you get around
 *
 * It used to carry two links — the admin log, and the way out — so moving
 * between the panel's eleven sections meant returning to the index every time
 * and picking a card. That is a table of contents, not a control panel: the
 * one screen that is on every screen was the one that did not know what the
 * panel contained.
 *
 * Now the sections are in a rail beside the content, sticky, with the one you
 * are in marked; below `lg` the same list is a `<details>` above the page. See
 * `@/components/admin/admin-nav`, and `@/view/admin-nav` for the tree they
 * both read.
 *
 * The header keeps what is not navigation between sections: where you are
 * (the panel), the way back to the board, and the way out of the panel. It is
 * sticky too, because leaving is a thing people want from the bottom of a long
 * settings page as much as from the top.
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
      {/*
        The rail is a dozen links before the page, every page. Without this,
        reaching the content by keyboard means passing all of them each time.
      */}
      <a
        href="#board-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-9 focus-visible:items-center focus-visible:rounded-md focus-visible:border focus-visible:border-border focus-visible:bg-card focus-visible:px-3 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-lg"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-card">
        {/*
          `min-h-14` and allowed to wrap, rather than a fixed row: on a narrow
          phone the two ways out do not fit beside the title, and squeezing
          them broke both labels across two lines inside a 56px box. Wrapped,
          the header is 56px at every width the rail is sticky at — which is
          what `top-14` below is measuring.
        */}
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <a
            href="/admin"
            className="font-serif text-lg font-semibold whitespace-nowrap text-foreground"
          >
            Control panel
          </a>
          {/*
            Not a `<nav>`: the sections are the navigation, and a landmark
            holding "the way out" would compete with the one that matters.
          */}
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
        {/*
          `self-start` is what makes `sticky` work in a flex row — a stretched
          item is already as tall as the row and has nowhere to stick to.
          `top-14` is the header, which is sticky above it.
        */}
        <aside className="px-6 pt-6 lg:sticky lg:top-14 lg:w-60 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0">
          <AdminNav />
        </aside>

        {/* `min-w-0`: without it a wide table inside a page stretches the row. */}
        <main id="board-content" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
