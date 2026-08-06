import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Badge, Card, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
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
    <PanelPage
      title="My forums"
      lede="Where you are appointed, and exactly what you may do in each."
    >
      <Card>
        {forums.length === 0 ? (
          <Empty className="py-8">
            <EmptyTitle>No forum appointments</EmptyTitle>
            <EmptyDescription>
              You are not assigned to any forum. Your group permissions still apply
              wherever they grant something.
            </EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {forums.map((forum) => (
              <li key={forum.forumId} className="flex flex-col gap-2 px-4 py-3">
                <a
                  href={`/forum/${forum.forumId}-${forum.slug}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {forum.title}
                </a>
                {forum.rights.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No granular rights here — your group permissions apply.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {forum.rights.map((right) => (
                      <li key={right}>
                        <Badge tone="outline">{right}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </CardRows>
        )}
      </Card>
    </PanelPage>
  )
}
