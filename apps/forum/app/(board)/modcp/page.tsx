import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModeratorPanel } from '@forum/moderation'

import { getContainer } from '@/server/container'
import { moderatedForumRights, resolveModCpAccess } from '@/server/modcp'

export const metadata: Metadata = { title: 'Moderator control panel' }

/**
 * F54's overview: what this moderator is responsible for, busiest first.
 *
 * The counts are one query for every forum rather than two per forum — a
 * dashboard listing fourteen forums must not be twenty-eight statements, which
 * is the N+1 F11's budget helper exists to catch.
 */
export default async function ModCpPage() {
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const { modcp } = getContainer()
  if (modcp === null) notFound()

  const forums = await moderatedForumRights(access)
  const dashboard = await new ModeratorPanel({ modcp }).dashboard({ forums })

  const outstanding = dashboard.reduce(
    (total, forum) => total + forum.pending + forum.openReports,
    0,
  )

  return (
    <main id="board-content" tabIndex={-1} className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Moderator control panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {outstanding === 0
            ? 'Nothing is waiting for you.'
            : `${outstanding} ${outstanding === 1 ? 'item is' : 'items are'} waiting across your forums.`}
        </p>
      </div>

      {dashboard.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {/*
            A group-level moderator with no forum appointments still reaches the
            panel — `modcp.access` is a real grant — and telling them the truth
            is better than an empty table that looks broken.
          */}
          You hold moderator permissions but are not assigned to any forum.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {dashboard.map((forum) => (
            <li
              key={forum.forumId}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a
                  href={`/forum/${forum.forumId}-${forum.slug}`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {forum.title}
                </a>
                <span className="flex gap-3 text-xs text-muted-foreground">
                  <a href="/moderation" className="hover:text-foreground">
                    {forum.pending} waiting
                  </a>
                  <a href="/moderation/reports" className="hover:text-foreground">
                    {forum.openReports} open {forum.openReports === 1 ? 'report' : 'reports'}
                  </a>
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {forum.rights.length === 0
                  ? 'No granular rights here — your group permissions apply.'
                  : forum.rights.join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
