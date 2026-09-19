import type { SlotCopy, SubforumListModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Counts, EDITORIAL_RULE, ITEM_RULE, Label, QUIET_LINK, ROW_HOVER } from '../shared'

export function SubforumList({ forums, copy }: SubforumListModel & { copy: SlotCopy }) {
  if (forums.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `meith.subforumList.${key}`)

  return (
    <section aria-labelledby="subforums-heading" className={`${EDITORIAL_RULE} pt-4`}>
      <Label as="h2" id="subforums-heading" className="pb-3">
        {c('heading')}
      </Label>

      <ul className="grid sm:grid-cols-2 sm:gap-x-8">
        {forums.map((forum) => (
          <li
            key={forum.id}
            className={`flex min-w-0 items-baseline justify-between gap-4 py-3 ${ITEM_RULE} ${ROW_HOVER}`}
          >
            <a
              href={forum.href}
              className={`min-w-0 truncate text-[0.95rem] font-medium text-foreground ${QUIET_LINK}`}
            >
              {forum.title}
            </a>
            {forum.type !== 'link' && (
              <Counts
                className="shrink-0 gap-x-3 text-xs"
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
    </section>
  )
}
