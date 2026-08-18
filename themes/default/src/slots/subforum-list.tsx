import type { SlotCopy, SubforumListModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardContent, CardHeader, CardTitle } from '@meith/ui'

import { Counts, LINK } from '../shared'

export function SubforumList({ forums, copy }: SubforumListModel & { copy: SlotCopy }) {
  if (forums.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `default.subforumList.${key}`)

  return (
    <Card aria-labelledby="subforums-heading">
      <CardHeader>
        <CardTitle id="subforums-heading" className="text-sm">
          {c('heading')}
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
                      label: c('threadsLabel'),
                      value: forum.threadCount,
                      one: c('thread.one'),
                      many: c('thread.other'),
                    },
                    {
                      label: c('postsLabel'),
                      value: forum.postCount,
                      one: c('post.one'),
                      many: c('post.other'),
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
