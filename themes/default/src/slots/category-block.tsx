import { Card, CardDescription, CardHeader, CardRows, CardTitle } from '@meith/ui'
import type { CategoryBlockModel } from '@meith/theme-kit'

import { LINK } from '../shared'

/**
 * One category and its communities (F29).
 *
 * The heading is a `<h2>` and the rows sit in a list, so the index has a real
 * document outline: a screen-reader user can jump between categories, which on a
 * board with fifteen of them is the difference between navigable and not.
 *
 * A block with no rows still renders its heading. An administrator who has
 * created a category and not yet filled it should see it on the board — an empty
 * category that renders as nothing looks like a save that failed.
 *
 * ## The listing is ruled, not boxed
 *
 * `CardRows` separates communities with a hairline instead of a gap. A board is read
 * by scanning down a column of titles, and a gap between every row breaks that
 * column into twenty objects the eye has to re-acquire. The card's border is the
 * only box; everything inside it is a table without being one.
 */
export function CategoryBlock({ category, children }: CategoryBlockModel) {
  const headingId = `category-${category.id}`

  return (
    <Card aria-labelledby={headingId}>
      <CardHeader className="flex-col items-start gap-0.5">
        <CardTitle id={headingId}>
          {/*
           * A category is a heading, not a destination: it holds no threads, so
           * linking it would send a reader to an empty community page. A root-level
           * *community* used as a block heading is a real place, and is linked.
           */}
          {category.type === 'category' ? (
            category.title
          ) : (
            <a href={category.href} className={LINK}>
              {category.title}
            </a>
          )}
        </CardTitle>
        {category.description !== null && (
          <CardDescription className="text-xs">{category.description}</CardDescription>
        )}
      </CardHeader>

      <CardRows>{children}</CardRows>
    </Card>
  )
}
