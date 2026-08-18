import type { CategoryBlockModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardRows } from '@meith/ui'

import { ColumnHeads, PanelHead } from '../shared'

export function CategoryBlock({
  category,
  children,
  copy,
}: CategoryBlockModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.categoryBlock.${key}`)
  const headingId = `category-${category.id}`

  return (
    <Card aria-labelledby={headingId}>
      <PanelHead
        id={headingId}
        title={category.title}
        href={category.href}
        {...(category.description === null
          ? {}
          : {
              aside: <span className="text-xs text-muted-foreground">{category.description}</span>,
            })}
      />

      <ColumnHeads first={c('forum')} counts={[c('threads'), c('posts')]} last={c('lastPost')} />

      <CardRows>{children}</CardRows>
    </Card>
  )
}
