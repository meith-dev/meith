import type { SlotCopy, SubforumListModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { MICRO, NUMERIC } from '../shared'

export function SubforumList({ forums, copy }: SubforumListModel & { copy: SlotCopy }) {
  if (forums.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `raidframe.subforumList.${key}`)

  return (
    <nav
      aria-label={c('ariaLabel')}
      className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2"
    >
      <span className={MICRO}>{c('label')}</span>
      {forums.map((forum) => (
        <a
          key={forum.href}
          href={forum.href}
          className="inline-flex items-center gap-1.5 border border-border bg-surface px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.1em] text-foreground uppercase hover:border-primary/60 hover:text-primary"
        >
          {forum.title}
          <span className={`${NUMERIC} text-muted-foreground`}>{forum.threadCount.label}</span>
        </a>
      ))}
    </nav>
  )
}
