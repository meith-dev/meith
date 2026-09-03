import type { CategoryBlockModel } from '@meith/theme-kit'
import { Card, CardDescription, CardHeader, CardRows, CardTitle } from '@meith/ui'

import { LINK } from '../shared'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
  const headingId = `category-${category.id}`

  return (
    <Card aria-labelledby={headingId} className="rounded-xl">
      <CardHeader className="flex-col items-start gap-0 bg-card px-5 py-3">
        <CardTitle id={headingId} className="flex items-center gap-2.5 text-base">
          <span aria-hidden="true" className="h-4 w-1 rounded-full bg-primary" />
          <a href={category.href} className={`${LINK} text-foreground`}>
            {category.title}
          </a>
        </CardTitle>
        {category.description !== null && (
          <CardDescription className="pl-3.5 text-xs">{category.description}</CardDescription>
        )}
      </CardHeader>

      <CardRows>{children}</CardRows>
    </Card>
  )
}
