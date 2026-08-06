import { notFound } from 'next/navigation'

import { resolveModCpAccess } from '@/server/modcp'

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
