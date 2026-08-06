import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ADMIN_IDLE_MINUTES } from '@meith/admin'

import { AdminNav } from '@/components/admin/admin-nav'
import { AdminSignInForm, AdminSignOutForm } from '@/components/admin/admin-forms'
import type { PanelLink } from '@/components/shell/panel-links'
import { PanelShell } from '@/components/shell/panel-shell'
import { resolveAdmin } from '@/server/admin'
import { getActor } from '@/server/context'

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
 * are in marked; below `lg` the same list is a `<details>` above the page. The
 * arrangement itself is `PanelShell` — the same one the member's and the
 * moderator's panels are laid out in, because three panels the same people move
 * between all day should not be three shapes to learn. See
 * `@/components/admin/admin-nav`, and `@/view/admin-nav` for the tree.
 *
 * The header keeps what is not navigation between sections: where you are
 * (the panel), the way back to the board, and the way out of the panel. It is
 * sticky too, because leaving is a thing people want from the bottom of a long
 * settings page as much as from the top.
 *
 * ## The page is the `<main>`, not this file
 *
 * It used to be this file, which made the ACP the one surface on the board
 * where the landmark did not belong to the screen you were reading. Every panel
 * page renders `PanelPage`, which is the `<main id="board-content">` the skip
 * link above points at — so the rule is now the same in the ACP as in the
 * board, and the skip link lands past the rail rather than in front of it.
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
        <AdminSignInForm
          next="/admin"
          reason="expired"
          idleMinutes={ADMIN_IDLE_MINUTES}
        />
      </main>
    )
  }

  /*
   * The panels an administrator also holds, at the foot of the rail. An
   * administrator is a member with an inbox and, usually, a moderator with a
   * queue; the account menu on the board was the only route between the three
   * and the ACP does not render the board's account menu.
   *
   * `getActor()` is `React.cache`d and `resolveAdmin` above has already called
   * it, so this is free.
   */
  const actor = await getActor()
  const links: readonly PanelLink[] = [
    { href: '/usercp', label: 'Your control panel' },
    ...(actor.global.canAccessModCp === true
      ? [{ href: '/modcp', label: 'Moderator CP' }]
      : []),
  ]

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
        {/*
          The same measure `PanelShell` uses below, so "Control panel" sits
          directly over the rail rather than a hundred pixels to the left of it.
        */}
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
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
          It has been a while since you confirmed your password. Anything destructive will
          ask again.
        </p>
      )}

      <PanelShell nav={<AdminNav />} links={links} railOffset="panel">
        {children}
      </PanelShell>
    </div>
  )
}
