import { Card, CardContent, CardHeader, CardTitle } from '@meith/ui'
import type { SubcommunityListModel } from '@meith/theme-kit'

import { Counts, LINK } from '../shared'

/**
 * The child communities of the community being displayed (F30).
 *
 * Compact by design: this sits above a thread list, and a reader who wanted the
 * subcommunities rather than the threads has usually come from the index where the
 * full rows already are. So it is a wrapped row of names with their counts,
 * not a second copy of `CommunityRow` — one screen of listing per page.
 *
 * The unread marker is deliberately absent here for the same reason. A community's
 * read state belongs to the row that shows its last post; repeating it in a
 * summary strip gives a reader a second, smaller version of a decision they
 * have already made.
 */
export function SubcommunityList({ communities }: SubcommunityListModel) {
  if (communities.length === 0) return null

  return (
    <Card aria-labelledby="subcommunities-heading">
      <CardHeader>
        <CardTitle id="subcommunities-heading" className="text-sm">
          Subcommunities
        </CardTitle>
      </CardHeader>

      <CardContent>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {communities.map((community) => (
            <li key={community.id} className="min-w-0">
              <a href={community.href} className={`font-medium text-foreground ${LINK}`}>
                {community.title}
              </a>
              {community.type !== 'link' && (
                <Counts
                  items={[
                    {
                      label: 'Threads',
                      value: community.threadCount,
                      one: 'thread',
                      many: 'threads',
                    },
                    {
                      label: 'Posts',
                      value: community.postCount,
                      one: 'post',
                      many: 'posts',
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
