import { Card, CardContent, CardHeader, CardTitle } from '@meith/ui'
import type { SubforumListModel } from '@meith/theme-kit'

import { Counts, LINK } from '../shared'

/**
 * The child forums of the forum being displayed (F30).
 *
 * Compact by design: this sits above a thread list, and a reader who wanted the
 * subforums rather than the threads has usually come from the index where the
 * full rows already are. So it is a wrapped row of names with their counts,
 * not a second copy of `ForumRow` — one screen of listing per page.
 *
 * The unread marker is deliberately absent here for the same reason. A forum's
 * read state belongs to the row that shows its last post; repeating it in a
 * summary strip gives a reader a second, smaller version of a decision they
 * have already made.
 */
export function SubforumList({ forums }: SubforumListModel) {
  if (forums.length === 0) return null

  return (
    <Card aria-labelledby="subforums-heading">
      <CardHeader>
        <CardTitle id="subforums-heading" className="text-sm">
          Subforums
        </CardTitle>
      </CardHeader>

      <CardContent>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {forums.map((forum) => (
            <li key={forum.id} className="min-w-0">
              <a href={forum.href} className={`font-medium text-foreground ${LINK}`}>
                {forum.title}
              </a>
              {forum.type !== 'link' && (
                <Counts
                  items={[
                    {
                      label: 'Threads',
                      value: forum.threadCount,
                      one: 'thread',
                      many: 'threads',
                    },
                    {
                      label: 'Posts',
                      value: forum.postCount,
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
