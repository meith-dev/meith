import type { SubforumListModel } from '@meith/theme-kit'
import { Card, CardContent, CardHeader, CardTitle } from '@meith/ui'

import { Counts, LINK } from '../shared'

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
