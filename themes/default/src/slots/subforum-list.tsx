import type { SlotCopy, SubforumListModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardRows } from '@meith/ui'

import { EYEBROW, Figures, LINK, Tile } from '../shared'

export function SubforumList({ forums, copy }: SubforumListModel & { copy: SlotCopy }) {
  if (forums.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `default.subforumList.${key}`)

  return (
    <Card aria-labelledby="subforums-heading" className="rounded-xl">
      <h2 id="subforums-heading" className={`${EYEBROW} border-b border-border px-5 py-2.5`}>
        {c('heading')}
      </h2>

      <CardRows className="grid sm:grid-cols-2 sm:divide-y-0">
        {forums.map((forum) => (
          <li
            key={forum.id}
            className="flex min-w-0 items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
          >
            <Tile label={forum.title} className="size-9 text-sm" />
            <span className="min-w-0 flex-1">
              <a
                href={forum.href}
                className={`block truncate text-sm font-medium text-foreground ${LINK}`}
              >
                {forum.title}
              </a>
            </span>
            {forum.type !== 'link' && (
              <Figures
                className="shrink-0"
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
      </CardRows>
    </Card>
  )
}
