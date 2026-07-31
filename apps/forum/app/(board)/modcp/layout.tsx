import { notFound } from 'next/navigation'

import { resolveModCpAccess } from '@/server/modcp'

/**
 * F54 — the ModCP shell.
 *
 * A layout rather than a repeated header, so the gate runs once per navigation
 * and every section below it can assume access has already been resolved. It
 * still resolves it again in each page: a layout is not a security boundary in
 * the App Router — a page can be requested directly as an RSC payload — and
 * "the layout checked it" is precisely the assumption that turns into a hole.
 *
 * Not `/admin`-style separate authentication (F63's job). A moderator is
 * already logged in as themselves and their powers are the ones the board
 * grants them; a second password would protect nothing that the first one does
 * not already.
 */
export default async function ModCpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const sections = [
    { href: '/modcp', label: 'Overview' },
    { href: '/moderation', label: 'Approval queue' },
    { href: '/moderation/reports', label: 'Reports' },
    { href: '/modcp/forums', label: 'My forums' },
    { href: '/modcp/log', label: 'Moderator log' },
    /*
     * Offered only to somebody who may actually use it. The address lookup has
     * its own answer for the same reason it has its own audit row: it is the
     * one section that reads personal data about somebody who has done nothing.
     */
    ...(access.canLookUpIp ? [{ href: '/modcp/ip', label: 'Address lookup' }] : []),
  ]

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <nav aria-label="Moderator control panel" className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {section.label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  )
}
