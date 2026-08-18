import type { SlotCopy, SubforumListModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function SubforumList({ forums, copy }: SubforumListModel & { copy: SlotCopy }) {
  if (forums.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `midnight.subforumList.${key}`)

  return (
    <nav
      aria-label={c('ariaLabel')}
      className="flex flex-wrap gap-x-3 gap-y-1 border border-border bg-muted px-3 py-2 font-mono text-xs"
    >
      {forums.map((forum) => (
        <a key={forum.href} href={forum.href} className="text-primary hover:underline">
          {forum.title}
          <span className="ml-1 text-muted-foreground">({forum.threadCount.label})</span>
        </a>
      ))}
    </nav>
  )
}
