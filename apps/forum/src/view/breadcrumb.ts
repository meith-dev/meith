import { ancestorIds } from '@meith/forums'
import type { LinkModel } from '@meith/theme-kit'

import { forumHref } from './board-index'

export interface CrumbForum {
  readonly id: number
  readonly slug: string
  readonly title: string
  readonly path: string
}

export interface BreadcrumbInput {
  readonly forums: readonly CrumbForum[]
  readonly forumId: number
  readonly visibleForumIds?: ReadonlySet<number>
  readonly leaf?: string
  readonly homeLabel?: string
}

export function buildBreadcrumb({
  forums,
  forumId,
  visibleForumIds,
  leaf,
  homeLabel = 'Forums',
}: BreadcrumbInput): readonly LinkModel[] {
  const byId = new Map(forums.map((forum) => [forum.id, forum]))
  const self = byId.get(forumId)

  const items: LinkModel[] = [{ label: homeLabel, href: '/' }]
  if (self === undefined) {
    if (leaf !== undefined) items.push({ label: leaf, href: '' })
    return items
  }

  const visible = (id: number) => visibleForumIds === undefined || visibleForumIds.has(id)

  for (const ancestorId of ancestorIds(self.path)) {
    const ancestor = byId.get(ancestorId)
    if (ancestor === undefined || !visible(ancestor.id)) continue
    items.push({ label: ancestor.title, href: forumHref(ancestor) })
  }

  items.push({ label: self.title, href: forumHref(self) })

  if (leaf !== undefined) items.push({ label: leaf, href: '' })

  return items
}
