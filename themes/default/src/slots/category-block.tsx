import type { CategoryBlockModel } from '@meith/theme-kit'
import { Card, CardDescription, CardHeader, CardRows, CardTitle } from '@meith/ui'

import { LINK } from '../shared'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
  const headingId = `category-${category.id}`

  return (
    <Card aria-labelledby={headingId}>
      <CardHeader className="flex-col items-start gap-0.5 border-b-primary/15 bg-primary/6">
        <CardTitle id={headingId} className="text-primary">
          <a href={category.href} className={`${LINK} hover:text-primary-hover`}>
            {category.title}
          </a>
        </CardTitle>
        {category.description !== null && (
          <CardDescription className="text-xs">{category.description}</CardDescription>
        )}
      </CardHeader>

      <CardRows>{children}</CardRows>
    </Card>
  )
}
