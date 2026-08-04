import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { moderatedForumRights, resolveModCpAccess } from '@/server/modcp'

export const metadata: Metadata = { title: 'My forums' }

/**
 * F54 — the forums this actor moderates and exactly what they may do in each.
 *
 * The screen F50 made necessary. Once "may lock threads" became something you
 * are appointed to per forum rather than a checkbox on a group, a moderator had
 * no way at all to find out what they had been appointed to — they discovered
 * it by pressing a button and being refused.
 */
export default async function ModCpForumsPage() {
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const forums = await moderatedForumRights(access)

  return (
    <main id="board-content" tabIndex={-1} className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-semibold">My forums</h1>

      {forums.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You are not assigned to any forum. Your group permissions still apply
          wherever they grant something.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {forums.map((forum) => (
            <li key={forum.forumId} className="rounded-lg border border-border bg-card p-4">
              <a
                href={`/forum/${forum.forumId}-${forum.slug}`}
                className="font-medium text-foreground hover:underline underline-offset-2"
              >
                {forum.title}
              </a>
              {forum.rights.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No granular rights here — your group permissions apply.
                </p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {forum.rights.map((right) => (
                    <li
                      key={right}
                      className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    >
                      {right}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
