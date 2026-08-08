import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Badge, Card, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { moderatedCommunityRights, resolveModCpAccess } from '@/server/modcp'

export const metadata: Metadata = { title: 'My communities' }

/**
 * F54 — the communities this actor moderates and exactly what they may do in each.
 *
 * The screen F50 made necessary. Once "may lock threads" became something you
 * are appointed to per community rather than a checkbox on a group, a moderator had
 * no way at all to find out what they had been appointed to — they discovered
 * it by pressing a button and being refused.
 */
export default async function ModCpCommunitiesPage() {
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const communities = await moderatedCommunityRights(access)

  return (
    <PanelPage
      title="My communities"
      lede="Where you are appointed, and exactly what you may do in each."
    >
      <Card>
        {communities.length === 0 ? (
          <Empty className="py-8">
            <EmptyTitle>No community appointments</EmptyTitle>
            <EmptyDescription>
              You are not assigned to any community. Your group permissions still apply
              wherever they grant something.
            </EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {communities.map((community) => (
              <li key={community.communityId} className="flex flex-col gap-2 px-4 py-3">
                <a
                  href={`/community/${community.communityId}-${community.slug}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {community.title}
                </a>
                {community.rights.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No granular rights here — your group permissions apply.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {community.rights.map((right) => (
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
