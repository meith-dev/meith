import type { CategoryBlockModel } from '@meith/theme-kit'
import { Card, CardRows } from '@meith/ui'

import { ColumnHeads, PanelHead } from '../shared'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
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

      <ColumnHeads first="Forum" counts={['Threads', 'Posts']} last="Last post" />

      <CardRows>{children}</CardRows>
    </Card>
  )
}
