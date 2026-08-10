import type { SubforumListModel } from '@meith/theme-kit'

export function SubforumList({ forums }: SubforumListModel) {
  if (forums.length === 0) return null

  return (
    <nav aria-label="Subforums" className="flex flex-wrap gap-x-3 gap-y-1 border border-border bg-muted px-3 py-2 font-mono text-xs">
      {forums.map((forum) => (
        <a key={forum.href} href={forum.href} className="text-primary hover:underline">
          {forum.title}
          <span className="ml-1 text-muted-foreground">({forum.threadCount})</span>
        </a>
      ))}
    </nav>
  )
}
