import type { SlotCopy, SubforumListModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { count, NUMERIC, plural } from '../shared'

export function SubforumList({ forums, copy }: SubforumListModel & { copy: SlotCopy }) {
  if (forums.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `phasebook.subforumList.${key}`)

  return (
    <section
      aria-labelledby="subforums-heading"
      className="rounded-lg border border-border bg-card text-card-foreground shadow-elevation"
    >
      <h2
        id="subforums-heading"
        className="px-4 pt-3 pb-1 text-[0.9375rem] font-semibold text-muted-foreground"
      >
        {c('title')}
      </h2>

      <ul className="flex flex-wrap gap-2 px-4 pt-1 pb-3">
        {forums.map((forum) => (
          <li key={forum.id}>
            <a
              href={forum.href}
              className="inline-flex items-baseline gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              {forum.title}
              {forum.type !== 'link' && (
                <span className={`text-xs font-medium text-muted-foreground ${NUMERIC}`}>
                  {count(forum.threadCount)}{' '}
                  {plural(forum.threadCount, c('thread.one'), c('thread.other'))}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
