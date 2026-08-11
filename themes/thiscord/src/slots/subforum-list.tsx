import type { SubforumListModel } from '@meith/theme-kit'

import { CATEGORY_HEADING, NUMERIC, PANEL, count, plural } from '../shared'

export function SubforumList({ forums }: SubforumListModel) {
  if (forums.length === 0) return null

  return (
    <section aria-labelledby="subforums-heading" className={PANEL}>
      <h2 id="subforums-heading" className={`${CATEGORY_HEADING} px-3 pt-3 pb-1`}>
        Subforums
      </h2>

      <ul className="flex flex-wrap gap-1.5 px-3 pt-1 pb-3">
        {forums.map((forum) => (
          <li key={forum.id}>
            <a
              href={forum.href}
              className="inline-flex items-baseline gap-1.5 rounded-sm bg-secondary px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
            >
              #{forum.title}
              {forum.type !== 'link' && (
                <span className={`text-xs font-normal text-muted-foreground ${NUMERIC}`}>
                  {count(forum.threadCount)} {plural(forum.threadCount, 'thread', 'threads')}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
