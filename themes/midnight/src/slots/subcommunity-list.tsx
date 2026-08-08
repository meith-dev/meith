import type { SubcommunityListModel } from '@meith/theme-kit'

/** Child communities as a compact inline strip above the thread table. */
export function SubcommunityList({ communities }: SubcommunityListModel) {
  if (communities.length === 0) return null

  return (
    <nav aria-label="Subcommunities" className="flex flex-wrap gap-x-3 gap-y-1 border border-border bg-muted px-3 py-2 font-mono text-xs">
      {communities.map((community) => (
        <a key={community.href} href={community.href} className="text-primary hover:underline">
          {community.title}
          <span className="ml-1 text-muted-foreground">({community.threadCount})</span>
        </a>
      ))}
    </nav>
  )
}
